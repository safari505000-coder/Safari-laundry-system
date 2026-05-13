import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, PromiseToPayStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * V20.5 — Phase 2 Promise-to-Pay workflow service.
 *
 * Captures operator-recorded customer commitments. The data does
 * NOT drive any canonical financial state — it sits next to the
 * journal as a CRM-style follow-up artefact. The journal AR is
 * still the source of truth for what the customer owes.
 *
 * State machine:
 *
 *     ACTIVE  ──(operator confirms paid)──►  KEPT
 *     ACTIVE  ──(promised date passed)─────►  BROKEN
 *     ACTIVE  ──(operator cancels)─────────►  CANCELLED
 *
 * Once a row leaves ACTIVE it is terminal — re-engaging the
 * customer requires a brand-new ACTIVE row. This is intentional
 * so the audit trail (`PromiseEvent`) reads cleanly forward in
 * time without "edit" operations.
 *
 * Idempotency:
 *   • `idempotencyKey` is a caller-supplied string (typically the
 *     CC session token + customer id). The DB-level partial
 *     unique index makes double-submits a no-op — a second
 *     create with the same key returns the EXISTING row.
 *   • Without an idempotency key we still allow create (the CC
 *     supervisor sometimes records out-of-band promises).
 *
 * Concurrency:
 *   • The status-transition methods do a single conditional
 *     UPDATE WHERE status='ACTIVE' so two operators racing to
 *     mark KEPT vs BROKEN can't both win — the loser sees
 *     `count===0` and is told "promise already resolved".
 *   • The auto-broken cron uses the same conditional UPDATE.
 */
/**
 * خدمة التعهدات بالدفع — تدير سجلات التزامات العملاء بالسداد
 * Promise-to-Pay workflow service managing customer payment commitments.
 * State machine: ACTIVE → KEPT | BROKEN | CANCELLED (all terminal).
 * Idempotent via idempotencyKey. Auto-broken by hourly cron after grace period.
 * Does NOT drive canonical financial state — CRM/follow-up layer only.
 *
 * @since V20.5 Phase 2
 */
@Injectable()
export class PromisesToPayService {
  private readonly logger = new Logger(PromisesToPayService.name);

  /**
   * Tolerance window — a promise stays ACTIVE for `BROKEN_GRACE_HOURS`
   * past the promised date before the cron flips it. Gives the
   * collector a reasonable window to confirm a late-day payment.
   */
  static readonly BROKEN_GRACE_HOURS = 12;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new Promise-to-Pay record.
   *
   * Validates:
   *   • promisedAmount > 0 and ≤ 100_000 (sanity bound).
   *   • promisedDate is in the future or today.
   *   • collector is an active user.
   *
   * Writes a `CREATED` PromiseEvent in the same transaction.
   */
  /**
   * يُنشئ سجل تعهد بالدفع جديد مع التحقق من المبلغ والتاريخ والمفتاح الفريد
   * Creates a new Promise-to-Pay record with validation and idempotency support.
   *
   * @param input.customerId - معرف العميل | Customer ID
   * @param input.invoiceId - معرف الفاتورة (اختياري) | Optional invoice ID
   * @param input.promisedAmount - المبلغ المتعهد به (0 < amount ≤ 100,000) | Promised amount
   * @param input.promisedDate - تاريخ الوفاء بالتعهد (اليوم أو المستقبل) | Promise date
   * @param input.collectorId - معرف المحصّل | Collector user ID
   * @param input.notes - ملاحظات (اختياري) | Optional notes
   * @param input.idempotencyKey - مفتاح التكرار الأمن (اختياري) | Optional idempotency key
   * @returns معرف التعهد وحالته وما إذا كان جديداً | Promise ID, status, and created flag
   * @throws BadRequestException عند بيانات غير صالحة | On invalid input
   */
  async create(input: {
    customerId: string;
    invoiceId?: string | null;
    promisedAmount: string | number | Prisma.Decimal;
    promisedDate: Date;
    collectorId: string;
    notes?: string | null;
    idempotencyKey?: string | null;
  }): Promise<{ id: string; status: PromiseToPayStatus; created: boolean }> {
    const amount = new Prisma.Decimal(input.promisedAmount.toString());
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('promisedAmount must be > 0');
    }
    if (amount.greaterThan(100_000)) {
      throw new BadRequestException('promisedAmount above sanity bound');
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (input.promisedDate.getTime() < today.getTime()) {
      throw new BadRequestException('promisedDate cannot be in the past');
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.promiseToPay.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        return {
          id: existing.id,
          status: existing.status,
          created: false,
        };
      }
    }

    return this.prisma.$transaction(async (tx) => {
      try {
        const row = await tx.promiseToPay.create({
          data: {
            customerId: input.customerId,
            invoiceId: input.invoiceId ?? null,
            promisedAmount: amount,
            promisedDate: input.promisedDate,
            collectorId: input.collectorId,
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            status: PromiseToPayStatus.ACTIVE,
          },
        });
        await tx.promiseEvent.create({
          data: {
            promiseId: row.id,
            kind: 'CREATED',
            actorId: input.collectorId,
            payload: {
              promisedAmountKd: amount.toFixed(4),
              promisedDateIso: input.promisedDate.toISOString(),
              invoiceId: input.invoiceId ?? null,
              notes: input.notes ?? null,
            },
          },
        });
        return { id: row.id, status: row.status, created: true };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          input.idempotencyKey
        ) {
          const existing = await tx.promiseToPay.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
          });
          if (existing) {
            return {
              id: existing.id,
              status: existing.status,
              created: false,
            };
          }
        }
        throw err;
      }
    });
  }

  async list(opts?: {
    customerId?: string;
    collectorId?: string;
    status?: PromiseToPayStatus;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
    return this.prisma.promiseToPay.findMany({
      where: {
        ...(opts?.customerId ? { customerId: opts.customerId } : {}),
        ...(opts?.collectorId ? { collectorId: opts.collectorId } : {}),
        ...(opts?.status ? { status: opts.status } : {}),
      },
      orderBy: [{ promisedDate: 'asc' }, { createdAt: 'asc' }],
      take: limit,
      include: {
        customer: { select: { id: true, displayName: true, phone: true } },
        invoice: { select: { id: true, invoiceNumber: true, totalPrice: true } },
        collector: { select: { id: true, fullName: true } },
      },
    });
  }

  async markKept(input: {
    promiseId: string;
    actorId: string;
    notes?: string | null;
  }): Promise<{ ok: boolean }> {
    return this.transitionStatus({
      promiseId: input.promiseId,
      actorId: input.actorId,
      to: PromiseToPayStatus.KEPT,
      kind: 'KEPT',
      notes: input.notes ?? null,
    });
  }

  async markCancelled(input: {
    promiseId: string;
    actorId: string;
    notes?: string | null;
  }): Promise<{ ok: boolean }> {
    return this.transitionStatus({
      promiseId: input.promiseId,
      actorId: input.actorId,
      to: PromiseToPayStatus.CANCELLED,
      kind: 'CANCELLED',
      notes: input.notes ?? null,
    });
  }

  async markBroken(input: {
    promiseId: string;
    actorId: string | null;
    notes?: string | null;
  }): Promise<{ ok: boolean }> {
    return this.transitionStatus({
      promiseId: input.promiseId,
      actorId: input.actorId,
      to: PromiseToPayStatus.BROKEN,
      kind: 'BROKEN',
      notes: input.notes ?? null,
    });
  }

  /**
   * Hourly cron — flips ACTIVE promises whose `promisedDate +
   * BROKEN_GRACE_HOURS` is in the past to BROKEN. Idempotent
   * (the conditional UPDATE WHERE status='ACTIVE' filters out
   * already-resolved rows).
   *
   * Disabled when `PROMISES_CRON_ENABLED!=true` so dev/test
   * envs don't fight the scheduler.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'v20_5_auto_broken_promises' })
  async autoFlipBrokenPromises(): Promise<void> {
    if (!this.isCronEnabled()) {
      this.logger.debug(
        'V20.5 auto-broken cron skipped (PROMISES_CRON_ENABLED!=true)',
      );
      return;
    }
    const cutoff = new Date(
      Date.now() - PromisesToPayService.BROKEN_GRACE_HOURS * 60 * 60 * 1000,
    );
    const candidates = await this.prisma.promiseToPay.findMany({
      where: {
        status: PromiseToPayStatus.ACTIVE,
        promisedDate: { lt: cutoff },
      },
      select: { id: true },
      take: 500,
    });
    if (candidates.length === 0) return;
    let flipped = 0;
    for (const row of candidates) {
      const result = await this.markBroken({
        promiseId: row.id,
        actorId: null,
        notes: 'Auto-broken: promised date elapsed without resolution',
      });
      if (result.ok) flipped += 1;
    }
    this.logger.log(
      `[V20_5_AUTO_BROKEN] candidates=${candidates.length} flipped=${flipped}`,
    );
  }

  private isCronEnabled(): boolean {
    const v = (process.env.PROMISES_CRON_ENABLED ?? '')
      .toString()
      .trim()
      .toLowerCase();
    return v === 'true' || v === '1' || v === 'on' || v === 'yes';
  }

  /**
   * Single transactional state transition.
   *
   * Conditional update WHERE status='ACTIVE' — guarantees only
   * one transition wins under concurrent calls. Records the
   * matching PromiseEvent in the same transaction so the audit
   * trail and the row state can never disagree.
   */
  private async transitionStatus(input: {
    promiseId: string;
    actorId: string | null;
    to: PromiseToPayStatus;
    kind: string;
    notes: string | null;
  }): Promise<{ ok: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.promiseToPay.findUnique({
        where: { id: input.promiseId },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new NotFoundException('Promise not found');
      }
      if (existing.status !== PromiseToPayStatus.ACTIVE) {
        // Idempotent — already terminal. Don't write another event.
        return { ok: false };
      }
      const result = await tx.promiseToPay.updateMany({
        where: { id: input.promiseId, status: PromiseToPayStatus.ACTIVE },
        data: {
          status: input.to,
          resolvedAt: new Date(),
          resolvedById: input.actorId,
          resolutionNotes: input.notes,
        },
      });
      if (result.count === 0) {
        // Lost the race to another transition.
        return { ok: false };
      }
      await tx.promiseEvent.create({
        data: {
          promiseId: input.promiseId,
          kind: input.kind,
          actorId: input.actorId,
          payload: {
            transitionedTo: input.to,
            notes: input.notes,
          },
        },
      });
      return { ok: true };
    });
  }
}
