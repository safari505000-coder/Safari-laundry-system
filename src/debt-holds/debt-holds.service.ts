import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  DebtHoldMode,
  DebtHoldStatus,
  DebtSource,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { summariseDebtHolds } from './debt-holds.summary';
import { ListDebtHoldsDto } from './dto/list-debt-holds.dto';

/**
 * V19.16 / V19.17 — the debt-hold domain.
 *
 *   • Computes "open customer debt attributable to an employee" —
 *     defined as the net open amount on `DebtLedgerEntry` rows whose
 *     underlying order was issued by (or transferred away from) the
 *     employee. This keeps the hold tied to the work the employee
 *     actually did; transferred-IN debt (V19.5 DebtTransfer flow) is
 *     attributed to the original driver, matching how commission
 *     earnings work.
 *   • Creates HELD slips at payroll-cut time when the policy is ACTIVE
 *     and the employee has positive open debt.
 *   • Promotes HELD → RELEASED when the matching customer debt
 *     clears. V19.17: the RELEASED amount is NOT auto-bundled into
 *     the next payroll anymore — it becomes a separate voucher that
 *     admin disburses via `markDisbursed`, matching the Owner's
 *     workflow ("salary goes out first, hold release goes out later").
 *
 * Never mutates `Payroll` directly — PayrollService reads the hold
 * snapshot and writes the payroll row itself.
 */
@Injectable()
export class DebtHoldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  private assertAdmin(role: SafariRole): void {
    const ok =
      role === SafariRole.OWNER ||
      role === SafariRole.GENERAL_MANAGER ||
      role === SafariRole.ACCOUNTANT ||
      role === SafariRole.MANAGER;
    if (!ok) throw new ForbiddenException();
  }

  // ─── Outstanding-debt computation ─────────────────────────────────

  /**
   * Sum open invoice-shortfall + subscription-overuse debt for orders
   * attributed to `employeeUserId` (original or current driver). Uses
   * the same per-order waterfall as V19.15's debt breakdown:
   * credits = sum(PAYMENT.amount) on that order; open = creation sum
   * minus credits, floored at 0.
   *
   * Returns a positive KD figure (4-dp fixed) and the raw numeric
   * decimal so callers can do further arithmetic without round-tripping.
   */
  async computeOpenDebtForEmployee(
    employeeUserId: string,
  ): Promise<{ debt: Prisma.Decimal; debtKd: string }> {
    // Orders attributed to this employee, current or pre-transfer.
    const orders = await this.prisma.order.findMany({
      where: {
        OR: [
          { driverId: employeeUserId },
          { transferredFromDriverId: employeeUserId },
        ],
      },
      select: { id: true },
    });
    if (orders.length === 0) {
      return { debt: new Prisma.Decimal(0), debtKd: '0.0000' };
    }
    const orderIds = orders.map((o) => o.id);

    // Debt created AGAINST this employee's orders, grouped by source.
    const ledger = await this.prisma.debtLedgerEntry.findMany({
      where: { orderId: { in: orderIds } },
      select: {
        orderId: true,
        source: true,
        amount: true,
      },
    });

    const perOrder = new Map<
      string,
      { created: Prisma.Decimal; paid: Prisma.Decimal }
    >();
    for (const e of ledger) {
      if (!e.orderId) continue;
      const row = perOrder.get(e.orderId) ?? {
        created: new Prisma.Decimal(0),
        paid: new Prisma.Decimal(0),
      };
      const amt = new Prisma.Decimal(e.amount.toString()).abs();
      if (e.source === DebtSource.PAYMENT) {
        row.paid = row.paid.add(amt);
      } else {
        // INVOICE_SHORTFALL, SUBSCRIPTION_OVERUSE, and legacy sources
        // all count as debt creation.
        row.created = row.created.add(amt);
      }
      perOrder.set(e.orderId, row);
    }

    let total = new Prisma.Decimal(0);
    for (const row of perOrder.values()) {
      const open = row.created.sub(row.paid);
      if (open.greaterThan(0)) total = total.add(open);
    }
    return { debt: total, debtKd: total.toFixed(4) };
  }

  /**
   * Build the debt-hold slip for a payroll-cut run without persisting
   * it. PayrollService calls this, then creates the Payroll row and
   * the matching `DebtHold` inside one transaction so the slip and the
   * `debtHoldAmount` column always agree.
   *
   * Returns `null` when the policy is inactive or the employee has no
   * open debt — caller should simply omit the hold line.
   */
  async buildHoldSnapshotForPayroll(employeeUserId: string): Promise<{
    debtAmount: Prisma.Decimal;
    holdAmount: Prisma.Decimal;
    holdMode: DebtHoldMode;
  } | null> {
    const policy = await this.systemSettings.getDebtHoldPolicy();
    if (!policy.isActive) return null;

    const { debt } = await this.computeOpenDebtForEmployee(employeeUserId);
    if (debt.isZero() || debt.isNegative()) return null;

    let hold: Prisma.Decimal;
    if (policy.holdMode === DebtHoldMode.FIXED && policy.fixedAmount) {
      // Cap the hold at the fixed ceiling, but never exceed actual debt.
      const ceiling = new Prisma.Decimal(policy.fixedAmount.toString());
      hold = Prisma.Decimal.min(debt, ceiling);
    } else {
      hold = debt;
    }

    return {
      debtAmount: debt,
      holdAmount: hold,
      holdMode: policy.holdMode,
    };
  }

  /**
   * Create the DebtHold row after PayrollService persists the payroll
   * id. Split from `buildHoldSnapshotForPayroll` so the caller can
   * drive the transaction boundary.
   */
  async persistHold(
    data: {
      employeeUserId: string;
      payrollId: string;
      debtAmount: Prisma.Decimal;
      holdAmount: Prisma.Decimal;
      holdMode: DebtHoldMode;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    return db.debtHold.create({
      data: {
        employeeUserId: data.employeeUserId,
        payrollId: data.payrollId,
        debtAmount: data.debtAmount.toFixed(4),
        holdAmount: data.holdAmount.toFixed(4),
        note: `Auto-hold at payroll cut (${data.holdMode})`,
      },
    });
  }

  /**
   * Called at the next payroll-cut: any HELD slips for this employee
   * whose underlying debt has been collected get flipped to RELEASED
   * and returned so the new Payroll row can surface the release as a
   * positive `debtReleaseAmount` line. Idempotent.
   */
  async releaseSettledHolds(
    employeeUserId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ releaseKd: string; releasedIds: string[] }> {
    const db = tx ?? this.prisma;
    const helds = await db.debtHold.findMany({
      where: { employeeUserId, status: DebtHoldStatus.HELD },
      select: { id: true, holdAmount: true, releasedAmount: true },
    });
    if (helds.length === 0) {
      return { releaseKd: '0.0000', releasedIds: [] };
    }
    // Re-read current open debt; anything the previously-held slip
    // covered that is now gone becomes eligible for release.
    const { debt } = await this.computeOpenDebtForEmployee(employeeUserId);
    let leftToCover = debt;
    let released = new Prisma.Decimal(0);
    const releasedIds: string[] = [];

    // Oldest holds release first (FIFO) — simple, predictable policy.
    const helds2 = [...helds].sort((a, b) => a.id.localeCompare(b.id));
    for (const h of helds2) {
      const hold = new Prisma.Decimal(h.holdAmount.toString());
      const already = new Prisma.Decimal(h.releasedAmount.toString());
      const remaining = hold.sub(already);
      if (remaining.lessThanOrEqualTo(0)) continue;
      if (leftToCover.greaterThanOrEqualTo(remaining)) {
        // Current open debt still exceeds this slip — not eligible yet.
        leftToCover = leftToCover.sub(remaining);
        continue;
      }
      // Partial or full release for this slip.
      const freeable = remaining.sub(leftToCover);
      leftToCover = new Prisma.Decimal(0);
      released = released.add(freeable);
      const newReleased = already.add(freeable);
      const allReleased = newReleased.greaterThanOrEqualTo(hold);
      await db.debtHold.update({
        where: { id: h.id },
        data: {
          releasedAmount: newReleased.toFixed(4),
          status: allReleased ? DebtHoldStatus.RELEASED : DebtHoldStatus.HELD,
          releaseDate: allReleased ? new Date() : null,
        },
      });
      releasedIds.push(h.id);
    }
    return { releaseKd: released.toFixed(4), releasedIds };
  }

  // ─── Read endpoints ───────────────────────────────────────────────

  async list(
    actorRole: SafariRole,
    actorUserId: string,
    dto: ListDebtHoldsDto,
  ) {
    const adminRoles: SafariRole[] = [
      SafariRole.OWNER,
      SafariRole.GENERAL_MANAGER,
      SafariRole.ACCOUNTANT,
      SafariRole.MANAGER,
    ];
    const isAdmin = adminRoles.includes(actorRole);
    const where: Prisma.DebtHoldWhereInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.from || dto.to
        ? {
            createdAt: {
              ...(dto.from ? { gte: new Date(dto.from) } : {}),
              ...(dto.to ? { lte: new Date(dto.to) } : {}),
            },
          }
        : {}),
      ...(isAdmin
        ? dto.employeeUserId
          ? { employeeUserId: dto.employeeUserId }
          : {}
        : { employeeUserId: actorUserId }),
    };
    const rows = await this.prisma.debtHold.findMany({
      where,
      include: {
        employee: { select: { id: true, fullName: true, username: true } },
        payroll: { select: { id: true, paymentDate: true, status: true } },
        disbursedBy: { select: { id: true, fullName: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return summariseDebtHolds(rows);
  }

  // ─── Manual holds (V19.17) ────────────────────────────────────────
  /**
   * Admin-created debt hold that is NOT tied to a payroll run. Used
   * by the payroll registry page when the Owner/GM wants to withhold
   * a one-off amount from an employee outside the automatic
   * open-customer-debt computation (e.g. personal cash advance that
   * the employee agreed to repay next salary).
   *
   * The row is created with no `payrollId`; `PayrollService.create`
   * will pick it up via the standard `releaseSettledHolds` path at the
   * next cut — but since `releaseSettledHolds` checks against open
   * customer debt only, a manual hold stays HELD until explicitly
   * released via `releaseManualHold` below.
   */
  async createManualHold(
    actorRole: SafariRole,
    dto: {
      employeeUserId: string;
      holdAmount: number;
      note?: string;
      payrollId?: string;
    },
  ) {
    if (actorRole !== SafariRole.OWNER) {
      throw new ForbiddenException('Only OWNER may create manual holds');
    }
    if (dto.holdAmount <= 0) {
      throw new ForbiddenException('holdAmount must be > 0');
    }
    const amount = new Prisma.Decimal(dto.holdAmount.toFixed(4));

    // Unlinked case — simplest path, no transaction needed.
    if (!dto.payrollId) {
      return this.prisma.debtHold.create({
        data: {
          employeeUserId: dto.employeeUserId,
          debtAmount: amount.toFixed(4),
          holdAmount: amount.toFixed(4),
          note: dto.note?.trim() || 'Manual hold (admin-initiated)',
        },
        include: {
          employee: { select: { id: true, fullName: true, username: true } },
        },
      });
    }

    // Linked case — stamp the hold on the payroll row + increment
    // that row's `debtHoldAmount` atomically so the payslip net is
    // correct immediately (no ghost holds).
    return this.prisma.$transaction(async (tx) => {
      const payroll = await tx.payroll.findUnique({
        where: { id: dto.payrollId },
        select: {
          id: true,
          userId: true,
          debtHoldAmount: true,
          status: true,
        },
      });
      if (!payroll) {
        throw new ForbiddenException('Payroll not found');
      }
      if (payroll.userId !== dto.employeeUserId) {
        throw new ForbiddenException(
          'Payroll does not belong to this employee',
        );
      }
      const hold = await tx.debtHold.create({
        data: {
          employeeUserId: dto.employeeUserId,
          payrollId: payroll.id,
          debtAmount: amount.toFixed(4),
          holdAmount: amount.toFixed(4),
          note: dto.note?.trim() || 'Manual hold (admin-initiated)',
        },
        include: {
          employee: { select: { id: true, fullName: true, username: true } },
        },
      });
      const current = new Prisma.Decimal(
        (payroll.debtHoldAmount ?? 0).toString(),
      );
      await tx.payroll.update({
        where: { id: payroll.id },
        data: { debtHoldAmount: current.add(amount).toFixed(4) },
      });
      return hold;
    });
  }

  /**
   * V19.17 — flip a hold (manual or automatic) to RELEASED. This marks
   * the amount as eligible-to-pay but does NOT disburse it; the admin
   * must still call `markDisbursed` after paying the employee (cash,
   * transfer, …). Admin-gated. Idempotent on already-released rows.
   */
  async releaseManualHold(actorRole: SafariRole, id: string) {
    if (actorRole !== SafariRole.OWNER) {
      throw new ForbiddenException('Only OWNER may release holds');
    }
    const row = await this.prisma.debtHold.findUnique({ where: { id } });
    if (!row) {
      throw new ForbiddenException('Hold not found');
    }
    if (row.status === DebtHoldStatus.RELEASED) {
      return row;
    }
    const hold = new Prisma.Decimal(row.holdAmount.toString());
    return this.prisma.debtHold.update({
      where: { id },
      data: {
        status: DebtHoldStatus.RELEASED,
        releasedAmount: hold.toFixed(4),
        releaseDate: new Date(),
      },
      include: {
        employee: { select: { id: true, fullName: true, username: true } },
      },
    });
  }

  /**
   * V19.17 — stamp a RELEASED hold as actually disbursed to the
   * employee (voucher paid). This is the closing half of the release
   * flow: after `releaseManualHold` marks the money owed back, admin
   * hands over the cash/transfer then calls this to record `disbursedAt`
   * and the actor for audit. A row may only be disbursed once; calling
   * again is a no-op. Owner / GM only.
   */
  async markDisbursed(actorRole: SafariRole, actorUserId: string, id: string) {
    if (actorRole !== SafariRole.OWNER) {
      throw new ForbiddenException('Only OWNER may disburse holds');
    }
    const row = await this.prisma.debtHold.findUnique({ where: { id } });
    if (!row) {
      throw new ForbiddenException('Hold not found');
    }
    if (row.status !== DebtHoldStatus.RELEASED) {
      throw new ForbiddenException(
        'Hold must be RELEASED before it can be disbursed',
      );
    }
    if (row.disbursedAt) {
      return row;
    }
    return this.prisma.debtHold.update({
      where: { id },
      data: {
        disbursedAt: new Date(),
        disbursedById: actorUserId,
      },
      include: {
        employee: { select: { id: true, fullName: true, username: true } },
        disbursedBy: { select: { id: true, fullName: true, username: true } },
      },
    });
  }

  /**
   * Live preview for the Owner: what the debt-hold slip would look
   * like right now for `employeeUserId`, without creating a row. Handy
   * for the "محجوز المديونية" widget on the Owner dashboard.
   */
  async previewForEmployee(actorRole: SafariRole, employeeUserId: string) {
    this.assertAdmin(actorRole);
    const snap = await this.buildHoldSnapshotForPayroll(employeeUserId);
    if (!snap) {
      return {
        isPolicyActive: (await this.systemSettings.getDebtHoldPolicy())
          .isActive,
        debtKd: '0.0000',
        holdKd: '0.0000',
        holdMode: null,
      };
    }
    return {
      isPolicyActive: true,
      debtKd: snap.debtAmount.toFixed(4),
      holdKd: snap.holdAmount.toFixed(4),
      holdMode: snap.holdMode,
    };
  }
}
