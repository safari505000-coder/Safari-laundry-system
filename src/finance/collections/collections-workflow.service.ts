import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CollectionsStage, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * V20.5 — Phase 3 Collections Workflow Engine.
 *
 * Owns the per-customer `CollectionsAccount` lifecycle and the
 * append-only stage event trail. Independent of the canonical
 * journal — this is the CRM/ops layer that decides who calls
 * whom and when.
 *
 * Stage graph (terminal states marked *):
 *
 *     NEW ─► CONTACTED ─► FOLLOW_UP ─► PROMISE_TO_PAY
 *                                           │
 *                                           ▼
 *                                       ESCALATED
 *                                           │
 *                                           ▼
 *                                         LEGAL
 *                                           │
 *                                           ▼
 *                                     WRITTEN_OFF * / CLOSED *
 *
 * Forward-only by default — operators can also "skip ahead"
 * (e.g. NEW → ESCALATED for a known legal case) but cannot
 * regress (LEGAL → CONTACTED is rejected). Reopening a CLOSED
 * account is allowed via `reopen()` which moves it back to
 * NEW with an escalation-level reset.
 */
/**
 * محرك سير عمل التحصيل — يدير دورة حياة حساب التحصيل للعميل
 * Collections workflow engine managing the per-customer CollectionsAccount lifecycle
 * and append-only stage event trail.
 * Stage graph: NEW→CONTACTED→FOLLOW_UP→PROMISE_TO_PAY→ESCALATED→LEGAL→WRITTEN_OFF/CLOSED.
 * Forward-only by default; reopening via `reopen()` only.
 *
 * @since V20.5 Phase 3
 */
@Injectable()
export class CollectionsWorkflowService {
  private readonly logger = new Logger(CollectionsWorkflowService.name);

  /**
   * SLA defaults (hours). Override per-customer by passing
   * `nextActionDueAt` directly when transitioning. The numbers
   * match the typical Safari collections playbook:
   *   • NEW             — call within 24h
   *   • CONTACTED       — follow up within 48h
   *   • FOLLOW_UP       — chase within 72h
   *   • PROMISE_TO_PAY  — verify on / after promised date
   *   • ESCALATED       — supervisor review within 24h
   *   • LEGAL           — legal team weekly cadence
   */
  /**
   * مواعيد اتفاقية مستوى الخدمة لكل مرحلة تحصيل بالساعات
   * Default SLA hours per collections stage for computing `nextActionDueAt`.
   */
  static readonly STAGE_SLA_HOURS: Record<CollectionsStage, number> = {
    [CollectionsStage.NEW]: 24,
    [CollectionsStage.CONTACTED]: 48,
    [CollectionsStage.FOLLOW_UP]: 72,
    [CollectionsStage.PROMISE_TO_PAY]: 24,
    [CollectionsStage.ESCALATED]: 24,
    [CollectionsStage.LEGAL]: 168,
    [CollectionsStage.WRITTEN_OFF]: 0,
    [CollectionsStage.CLOSED]: 0,
  };

  /**
   * Stage rank — higher = more severe. Used to enforce
   * forward-only transitions. WRITTEN_OFF and CLOSED share the
   * top rank; reopening goes through `reopen()` which writes a
   * `REOPENED` audit row instead of a stage transition.
   */
  /**
   * ترتيب المراحل الرقمي لفرض قاعدة التقدم الأمامي فقط
   * Numeric stage rank used to enforce forward-only transition validation.
   */
  static readonly STAGE_RANK: Record<CollectionsStage, number> = {
    [CollectionsStage.NEW]: 0,
    [CollectionsStage.CONTACTED]: 1,
    [CollectionsStage.FOLLOW_UP]: 2,
    [CollectionsStage.PROMISE_TO_PAY]: 3,
    [CollectionsStage.ESCALATED]: 4,
    [CollectionsStage.LEGAL]: 5,
    [CollectionsStage.WRITTEN_OFF]: 6,
    [CollectionsStage.CLOSED]: 6,
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent — returns the existing account or creates a NEW
   * one. Used by the collections workbench when an operator
   * opens a customer profile that has never been worked.
   */
  /**
   * يفتح حساب تحصيل جديد للعميل أو يُرجع الحساب الموجود
   * Idempotent — returns the existing account or creates a NEW one.
   *
   * @param input.customerId - معرف العميل | Customer ID
   * @param input.actorId - معرف المستخدم الفاعل (اختياري) | Optional actor ID
   * @param input.assignedCollectorId - معرف المحصّل المعين (اختياري) | Optional collector
   * @returns حساب التحصيل الموجود أو المُنشأ | Existing or newly created collections account
   */
  async openOrGet(input: {
    customerId: string;
    actorId?: string | null;
    assignedCollectorId?: string | null;
  }) {
    const existing = await this.prisma.collectionsAccount.findUnique({
      where: { customerId: input.customerId },
    });
    if (existing) return existing;

    return this.prisma.$transaction(async (tx) => {
      try {
        const created = await tx.collectionsAccount.create({
          data: {
            customerId: input.customerId,
            currentStage: CollectionsStage.NEW,
            stageUpdatedById: input.actorId ?? null,
            assignedCollectorId: input.assignedCollectorId ?? null,
            nextActionDueAt: this.computeNextDue(CollectionsStage.NEW),
          },
        });
        await tx.collectionsStageEvent.create({
          data: {
            accountId: created.id,
            fromStage: null,
            toStage: CollectionsStage.NEW,
            actorId: input.actorId ?? null,
            reason: 'OPENED',
            payload: {
              assignedCollectorId: input.assignedCollectorId ?? null,
            },
            escalationLevelBefore: null,
            escalationLevelAfter: 0,
          },
        });
        return created;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // Lost race — return whichever row won.
          const existing2 = await tx.collectionsAccount.findUnique({
            where: { customerId: input.customerId },
          });
          if (existing2) return existing2;
        }
        throw err;
      }
    });
  }

  /**
   * Transition the account to a new stage. Forward-only with
   * the exception of CLOSED → NEW (reopen, see `reopen()`).
   *
   * Validates rank monotonically. Bumps `escalationLevel` when
   * moving into ESCALATED or LEGAL. Stamps `closedAt` for
   * terminal states. Always writes one CollectionsStageEvent
   * row in the same transaction so the audit trail and the
   * account state can never diverge.
   */
  /**
   * يُحوّل حساب التحصيل إلى مرحلة أمامية جديدة مع تسجيل أثر التدقيق
   * Transitions the collections account to a new stage (forward-only).
   * Bumps escalationLevel on ESCALATED/LEGAL. Writes one CollectionsStageEvent atomically.
   *
   * @param input.customerId - معرف العميل | Customer ID
   * @param input.toStage - المرحلة الجديدة | Target collections stage
   * @param input.actorId - معرف المستخدم الفاعل | Actor user ID
   * @param input.reason - سبب التحويل (اختياري) | Optional transition reason
   * @returns نتيجة التحويل مع المرحلة السابقة والجديدة | Transition result
   * @throws BadRequestException عند محاولة التراجع أو تكرار نفس المرحلة | On regression or same-stage
   * @throws NotFoundException إذا لم يُوجد الحساب | If account not found
   */
  async transition(input: {
    customerId: string;
    toStage: CollectionsStage;
    actorId: string | null;
    reason?: string | null;
    nextActionDueAt?: Date | null;
    writeOffAmountKd?: string | number | Prisma.Decimal | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.collectionsAccount.findUnique({
        where: { customerId: input.customerId },
      });
      if (!account) {
        throw new NotFoundException(
          'CollectionsAccount not found — call openOrGet() first',
        );
      }
      const fromStage = account.currentStage;
      const fromRank = CollectionsWorkflowService.STAGE_RANK[fromStage];
      const toRank = CollectionsWorkflowService.STAGE_RANK[input.toStage];

      if (toRank < fromRank) {
        throw new BadRequestException(
          `Forward-only collections workflow: cannot regress ${fromStage} → ${input.toStage}`,
        );
      }
      if (
        toRank === fromRank &&
        input.toStage === fromStage &&
        input.toStage !== CollectionsStage.WRITTEN_OFF
      ) {
        // Same-stage no-op (rank tie between WRITTEN_OFF and CLOSED
        // is allowed; same exact stage is not).
        return { ok: false as const, reason: 'NO_OP_SAME_STAGE' };
      }

      const escalationBefore = account.escalationLevel;
      let escalationAfter = escalationBefore;
      if (
        input.toStage === CollectionsStage.ESCALATED ||
        input.toStage === CollectionsStage.LEGAL
      ) {
        escalationAfter = escalationBefore + 1;
      }

      const isTerminal =
        input.toStage === CollectionsStage.WRITTEN_OFF ||
        input.toStage === CollectionsStage.CLOSED;

      const writeOff =
        input.writeOffAmountKd != null
          ? new Prisma.Decimal(input.writeOffAmountKd.toString())
          : input.toStage === CollectionsStage.WRITTEN_OFF
          ? account.writeOffAmountKd
          : null;

      if (input.toStage === CollectionsStage.WRITTEN_OFF && !writeOff) {
        throw new BadRequestException(
          'WRITTEN_OFF requires writeOffAmountKd',
        );
      }

      await tx.collectionsAccount.update({
        where: { id: account.id },
        data: {
          currentStage: input.toStage,
          stageUpdatedAt: new Date(),
          stageUpdatedById: input.actorId,
          escalationLevel: escalationAfter,
          closedAt: isTerminal ? new Date() : null,
          nextActionDueAt: isTerminal
            ? null
            : input.nextActionDueAt ?? this.computeNextDue(input.toStage),
          writeOffAmountKd: writeOff,
        },
      });
      await tx.collectionsStageEvent.create({
        data: {
          accountId: account.id,
          fromStage,
          toStage: input.toStage,
          actorId: input.actorId,
          reason: input.reason ?? null,
          payload: {
            writeOffAmountKd: writeOff?.toFixed(4) ?? null,
            nextActionDueAtIso:
              (input.nextActionDueAt ?? this.computeNextDue(input.toStage))
                ?.toISOString() ?? null,
          },
          escalationLevelBefore: escalationBefore,
          escalationLevelAfter: escalationAfter,
        },
      });
      return { ok: true as const, fromStage, toStage: input.toStage };
    });
  }

  /**
   * يُعيّن محصّلاً لحساب التحصيل مع تسجيل الحدث
   * Assigns or re-assigns a collector to the collections account.
   *
   * @param input.customerId - معرف العميل | Customer ID
   * @param input.collectorId - معرف المحصّل (null لإلغاء التعيين) | Collector ID or null
   * @param input.actorId - معرف المستخدم الفاعل | Actor user ID
   * @returns نتيجة التعيين | Assignment result
   * @throws NotFoundException إذا لم يُوجد الحساب | If account not found
   */
  async assign(input: {
    customerId: string;
    collectorId: string | null;
    actorId: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.collectionsAccount.findUnique({
        where: { customerId: input.customerId },
      });
      if (!account) {
        throw new NotFoundException('CollectionsAccount not found');
      }
      await tx.collectionsAccount.update({
        where: { id: account.id },
        data: { assignedCollectorId: input.collectorId },
      });
      await tx.collectionsStageEvent.create({
        data: {
          accountId: account.id,
          fromStage: account.currentStage,
          toStage: account.currentStage,
          actorId: input.actorId,
          reason: 'ASSIGNED',
          payload: {
            previousCollectorId: account.assignedCollectorId,
            newCollectorId: input.collectorId,
          },
        },
      });
      return { ok: true };
    });
  }

  /**
   * يُسجّل تواصل مع العميل ويُحوّل المرحلة تلقائياً من NEW إلى CONTACTED
   * Records a contact attempt and auto-transitions from NEW to CONTACTED if still in NEW stage.
   *
   * @param input.customerId - معرف العميل | Customer ID
   * @param input.actorId - معرف المستخدم الفاعل | Actor user ID
   * @param input.notes - ملاحظات التواصل (اختياري) | Optional contact notes
   * @returns نتيجة تسجيل التواصل | Contact record result
   * @throws NotFoundException إذا لم يُوجد الحساب | If account not found
   */
  async recordContact(input: {
    customerId: string;
    actorId: string | null;
    notes?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.collectionsAccount.findUnique({
        where: { customerId: input.customerId },
      });
      if (!account) {
        throw new NotFoundException('CollectionsAccount not found');
      }
      const now = new Date();
      const wasNew = account.currentStage === CollectionsStage.NEW;
      await tx.collectionsAccount.update({
        where: { id: account.id },
        data: {
          lastContactAt: now,
          ...(wasNew
            ? {
                currentStage: CollectionsStage.CONTACTED,
                stageUpdatedAt: now,
                stageUpdatedById: input.actorId,
                nextActionDueAt: this.computeNextDue(
                  CollectionsStage.CONTACTED,
                ),
              }
            : {}),
        },
      });
      if (wasNew) {
        await tx.collectionsStageEvent.create({
          data: {
            accountId: account.id,
            fromStage: CollectionsStage.NEW,
            toStage: CollectionsStage.CONTACTED,
            actorId: input.actorId,
            reason: 'AUTO_CONTACTED',
            payload: { notes: input.notes ?? null },
          },
        });
      } else {
        await tx.collectionsStageEvent.create({
          data: {
            accountId: account.id,
            fromStage: account.currentStage,
            toStage: account.currentStage,
            actorId: input.actorId,
            reason: 'CONTACT_LOGGED',
            payload: { notes: input.notes ?? null },
          },
        });
      }
      return { ok: true };
    });
  }

  /**
   * Reopen a terminal (WRITTEN_OFF or CLOSED) account back to NEW.
   * Resets escalation level. Records a `REOPENED` audit event.
   *
   * Cannot be used on an active account — the operator should
   * use `transition()` to move forward.
   */
  async reopen(input: {
    customerId: string;
    actorId: string | null;
    reason?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.collectionsAccount.findUnique({
        where: { customerId: input.customerId },
      });
      if (!account) {
        throw new NotFoundException('CollectionsAccount not found');
      }
      if (
        account.currentStage !== CollectionsStage.WRITTEN_OFF &&
        account.currentStage !== CollectionsStage.CLOSED
      ) {
        throw new BadRequestException(
          'Reopen only allowed on WRITTEN_OFF or CLOSED accounts',
        );
      }
      const fromStage = account.currentStage;
      const escalationBefore = account.escalationLevel;
      await tx.collectionsAccount.update({
        where: { id: account.id },
        data: {
          currentStage: CollectionsStage.NEW,
          stageUpdatedAt: new Date(),
          stageUpdatedById: input.actorId,
          escalationLevel: 0,
          closedAt: null,
          nextActionDueAt: this.computeNextDue(CollectionsStage.NEW),
          writeOffAmountKd: null,
        },
      });
      await tx.collectionsStageEvent.create({
        data: {
          accountId: account.id,
          fromStage,
          toStage: CollectionsStage.NEW,
          actorId: input.actorId,
          reason: input.reason ?? 'REOPENED',
          payload: { reopenedFrom: fromStage },
          escalationLevelBefore: escalationBefore,
          escalationLevelAfter: 0,
        },
      });
      return { ok: true };
    });
  }

  /**
   * يُرجع حساب التحصيل للعميل مع آخر 25 حدثاً من أثر التدقيق
   * Returns the collections account with the last 25 stage events and assigned collector.
   *
   * @param customerId - معرف العميل | Customer ID
   * @returns حساب التحصيل أو null إذا لم يُوجد | Collections account or null
   */
  async getAccount(customerId: string) {
    return this.prisma.collectionsAccount.findUnique({
      where: { customerId },
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        stageEvents: { orderBy: { createdAt: 'desc' }, take: 25 },
      },
    });
  }

  /**
   * يُرجع الحسابات التي تجاوزت ميعاد الإجراء التالي المحدد
   * Returns active collections accounts whose nextActionDueAt has passed.
   *
   * @param opts.limit - عدد الصفوف (افتراضي: 100، أقصى: 500) | Row limit
   * @returns قائمة الحسابات متجاوزة SLA مرتبة بالأقدم أولاً | Overdue SLA accounts
   */
  async listOverdueSla(opts?: { limit?: number }) {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
    return this.prisma.collectionsAccount.findMany({
      where: {
        nextActionDueAt: { not: null, lt: new Date() },
        currentStage: {
          notIn: [CollectionsStage.WRITTEN_OFF, CollectionsStage.CLOSED],
        },
      },
      orderBy: { nextActionDueAt: 'asc' },
      take: limit,
    });
  }

  private computeNextDue(stage: CollectionsStage): Date | null {
    const hours = CollectionsWorkflowService.STAGE_SLA_HOURS[stage];
    if (!hours) return null;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }
}
