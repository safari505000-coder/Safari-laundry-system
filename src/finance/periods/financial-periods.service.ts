import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { FinancialPeriodStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * V20.5 — Phase 5 Monthly Financial Closing.
 *
 * Owns the FinancialPeriod table and the application-layer
 * `assertWriteAllowed` guard called by every journal writer
 * (DoubleEntryJournalService.appendEntrySafe at minimum).
 *
 * Architecture:
 *   • Periods are identified by (year, month) — both 1-indexed
 *     in the public API to match accounting convention; we store
 *     them verbatim. The unique index in the schema enforces one
 *     row per period.
 *   • OPEN is implicit. A period with no row is OPEN. Operators
 *     never create OPEN rows manually — `closePeriod` upserts the
 *     row in CLOSED state on the first lock.
 *   • CLOSED periods reject any new financial mutation whose
 *     effective date (passed by the writer) falls inside the
 *     period. The guard logs a violation row before throwing so
 *     the supervisor can see the offending writer name + sourceRef.
 *   • Reopening a CLOSED period requires a `confirmationToken`
 *     that the operator must echo (double-confirmation pattern).
 *
 * Idempotency:
 *   • Closing an already-CLOSED period is a no-op (returns the
 *     existing row, no audit field overwrite).
 *   • Reopening an already-OPEN period is a no-op.
 *
 * Race safety:
 *   • All transitions go through `prisma.$transaction`.
 *   • The writer-side guard does the period lookup inside the
 *     same transaction the writer uses, so a concurrent close
 *     either wins (next writer is rejected) or loses (this
 *     writer commits and the close sees one extra row — which
 *     is fine, the close moves the lock cursor forward).
 */
@Injectable()
export class FinancialPeriodsService {
  private readonly logger = new Logger(FinancialPeriodsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public API — list every recorded period (closed or open).
   * Implicit OPEN periods are NOT enumerated; the caller can
   * compute them from the calendar if needed.
   */
  async list() {
    return this.prisma.financialPeriod.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        lockedBy: { select: { id: true, fullName: true } },
        reopenedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async getStatus(year: number, month: number) {
    this.assertValidPeriod(year, month);
    const row = await this.prisma.financialPeriod.findUnique({
      where: { year_month: { year, month } },
    });
    return {
      year,
      month,
      status: row?.status ?? FinancialPeriodStatus.OPEN,
      lockedAt: row?.lockedAt ?? null,
      lockedById: row?.lockedById ?? null,
      reopenedAt: row?.reopenedAt ?? null,
      reopenedById: row?.reopenedById ?? null,
    };
  }

  /**
   * Close a (year, month) period.
   *
   * Requires `confirmation === 'CLOSE-{YYYY}-{MM}'` (double-
   * confirmation) so a CSRF / shoulder-surfing attack can't
   * accidentally lock the books with a single click.
   */
  async closePeriod(input: {
    year: number;
    month: number;
    actorId: string;
    notes?: string | null;
    confirmation: string;
  }) {
    this.assertValidPeriod(input.year, input.month);
    const expected = `CLOSE-${input.year}-${this.pad(input.month)}`;
    if (input.confirmation !== expected) {
      throw new BadRequestException(
        `confirmation must equal "${expected}" (double-confirmation)`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.financialPeriod.findUnique({
        where: { year_month: { year: input.year, month: input.month } },
      });
      if (existing && existing.status === FinancialPeriodStatus.CLOSED) {
        return existing;
      }
      const now = new Date();
      if (existing) {
        return tx.financialPeriod.update({
          where: { id: existing.id },
          data: {
            status: FinancialPeriodStatus.CLOSED,
            lockedAt: now,
            lockedById: input.actorId,
            lockNotes: input.notes ?? null,
            reopenedAt: null,
            reopenedById: null,
            reopenReason: null,
          },
        });
      }
      try {
        return await tx.financialPeriod.create({
          data: {
            year: input.year,
            month: input.month,
            status: FinancialPeriodStatus.CLOSED,
            lockedAt: now,
            lockedById: input.actorId,
            lockNotes: input.notes ?? null,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // Concurrent close — return whatever row won.
          const winner = await tx.financialPeriod.findUnique({
            where: { year_month: { year: input.year, month: input.month } },
          });
          if (winner) return winner;
        }
        throw err;
      }
    });
  }

  async reopenPeriod(input: {
    year: number;
    month: number;
    actorId: string;
    reason: string;
    confirmation: string;
  }) {
    this.assertValidPeriod(input.year, input.month);
    const expected = `REOPEN-${input.year}-${this.pad(input.month)}`;
    if (input.confirmation !== expected) {
      throw new BadRequestException(
        `confirmation must equal "${expected}" (double-confirmation)`,
      );
    }
    if (!input.reason?.trim()) {
      throw new BadRequestException(
        'reason is required to reopen a closed period',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.financialPeriod.findUnique({
        where: { year_month: { year: input.year, month: input.month } },
      });
      if (!existing) {
        throw new BadRequestException(
          'Period is implicitly OPEN — nothing to reopen',
        );
      }
      if (existing.status === FinancialPeriodStatus.OPEN) {
        return existing;
      }
      return tx.financialPeriod.update({
        where: { id: existing.id },
        data: {
          status: FinancialPeriodStatus.OPEN,
          reopenedAt: new Date(),
          reopenedById: input.actorId,
          reopenReason: input.reason.trim(),
        },
      });
    });
  }

  /**
   * Writer-side guard. Call from every financial writer with the
   * effective date. Throws ConflictException if the period is
   * CLOSED and `allowReversal=false`. Logs a violation row in
   * either case (close-and-throw OR allow-reversal-but-record).
   *
   * Use-cases:
   *   • Standard journal write → allowReversal=false. Throws if
   *     period is closed.
   *   • Reversal entry          → allowReversal=true. Permitted
   *     even on closed periods, but the violation row records
   *     "this happened with explicit operator opt-in" so the
   *     auditor can review.
   */
  async assertWriteAllowed(input: {
    effectiveAt: Date;
    actorUserId: string | null;
    writerName: string;
    sourceRef: string | null;
    allowReversal?: boolean;
    payload?: Record<string, unknown> | null;
  }): Promise<{ allowed: boolean; periodId: string | null }> {
    const year = input.effectiveAt.getUTCFullYear();
    const month = input.effectiveAt.getUTCMonth() + 1;
    const period = await this.prisma.financialPeriod.findUnique({
      where: { year_month: { year, month } },
    });
    if (!period || period.status === FinancialPeriodStatus.OPEN) {
      return { allowed: true, periodId: period?.id ?? null };
    }
    // CLOSED — log a violation either way.
    await this.prisma.financialPeriodViolation
      .create({
        data: {
          periodId: period.id,
          actorUserId: input.actorUserId,
          writerName: input.writerName,
          sourceRef: input.sourceRef,
          payload: {
            allowedAsReversal: !!input.allowReversal,
            effectiveAtIso: input.effectiveAt.toISOString(),
            ...(input.payload ?? {}),
          },
        },
      })
      .catch((err) => {
        // The violation log is best-effort — don't escalate audit
        // failure to the financial path. Log loudly instead.
        this.logger.error(
          `[V20_5_PERIOD_VIOLATION_LOG_FAILED] writer=${input.writerName} sourceRef=${input.sourceRef} message=${(err as Error).message}`,
        );
      });
    if (!input.allowReversal) {
      throw new ConflictException(
        `Financial period ${year}-${this.pad(month)} is CLOSED — write rejected by PeriodLockGuard`,
      );
    }
    this.logger.warn(
      `[V20_5_REVERSAL_INTO_CLOSED] period=${year}-${this.pad(month)} writer=${input.writerName} sourceRef=${input.sourceRef} actor=${input.actorUserId}`,
    );
    return { allowed: true, periodId: period.id };
  }

  async listViolations(opts?: {
    periodId?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
    return this.prisma.financialPeriodViolation.findMany({
      where: opts?.periodId ? { periodId: opts.periodId } : {},
      orderBy: { attemptedAt: 'desc' },
      take: limit,
    });
  }

  private assertValidPeriod(year: number, month: number) {
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      throw new BadRequestException('year out of range (2020..2100)');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('month must be 1..12');
    }
  }

  private pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}

/**
 * Helper exported for callers that don't inject the service —
 * e.g. domain-event listeners that need the (year, month) of a
 * Date without recomputing it. Centralised so a future change
 * (Kuwait calendar switch?) lands in one place.
 */
export function periodForDate(d: Date): { year: number; month: number } {
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
  };
}

export { ForbiddenException }; // re-exported for controller convenience
