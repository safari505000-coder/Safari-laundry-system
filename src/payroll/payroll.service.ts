import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PayrollStatus, Prisma, SafariRole } from '@prisma/client';
import { CommissionPayoutsService } from '../commissions/commission-payouts.service';
import { DebtHoldsService } from '../debt-holds/debt-holds.service';
import { LoansService } from '../loans/loans.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * V19.16 — net pay math. Commission is added ON TOP of base + allowances;
 * the debt-hold slice is subtracted; and the release line is added back
 * when previously-withheld debt has been collected.
 *
 *   net = basic + allowances + commission + debtRelease − deductions − debtHold
 */
function netPay(row: {
  basicSalary: Prisma.Decimal;
  allowances: Prisma.Decimal;
  deductions: Prisma.Decimal;
  commissionAmount?: Prisma.Decimal | null;
  debtHoldAmount?: Prisma.Decimal | null;
  debtReleaseAmount?: Prisma.Decimal | null;
}): Prisma.Decimal {
  const commission = row.commissionAmount ?? new Prisma.Decimal(0);
  const hold = row.debtHoldAmount ?? new Prisma.Decimal(0);
  const release = row.debtReleaseAmount ?? new Prisma.Decimal(0);
  return row.basicSalary
    .add(row.allowances)
    .add(commission)
    .add(release)
    .sub(row.deductions)
    .sub(hold);
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => LoansService))
    private readonly loans: LoansService,
    private readonly commissionPayouts: CommissionPayoutsService,
    private readonly debtHolds: DebtHoldsService,
  ) {}

  private assertOwnerOrManager(role: SafariRole): void {
    if (
      role !== SafariRole.OWNER &&
      role !== SafariRole.GENERAL_MANAGER &&
      role !== SafariRole.MANAGER
    ) {
      throw new ForbiddenException();
    }
  }

  async create(
    actorRole: SafariRole,
    dto: {
      userId: string;
      branchId: string;
      basicSalary: number;
      allowances?: number;
      deductions?: number;
      paymentDate: string;
    },
  ) {
    this.assertOwnerOrManager(actorRole);
    const basic = new Prisma.Decimal(dto.basicSalary.toFixed(4));
    const allow = new Prisma.Decimal((dto.allowances ?? 0).toFixed(4));
    const manualDed = new Prisma.Decimal((dto.deductions ?? 0).toFixed(4));

    // DUSTUR §D.5 — apply active-loan monthly installments as extra
    // deductions in the same DB transaction so the payroll row and
    // the loan balance updates are atomic. The driver/manager only
    // inputs the manual deductions; the automated loan slice is
    // layered on top.
    //
    // V19.16 — we also run three new ledgers inside the same
    // transaction:
    //   1. Commission: sum of RELEASED CommissionPayouts up to cut time
    //      flows into `commissionAmount`; the matching rows are stamped
    //      PAID + payrollId before we return so replaying the cut
    //      cannot double-pay.
    //   2. Debt-hold release: any previously-HELD DebtHold whose
    //      underlying customer debt is now cleared is marked RELEASED
    //      and surfaced via `debtReleaseAmount` (positive line).
    //   3. Debt-hold snapshot: if the policy is ACTIVE and the employee
    //      still has open customer debt, a fresh HELD slip is persisted
    //      and reflected in `debtHoldAmount` (negative line).
    const paymentDate = new Date(dto.paymentDate);
    return this.prisma.$transaction(async (tx) => {
      // Loan slice (existing behaviour).
      const loanDeduction = await this.loans.applyMonthlyDeductionForUser(
        dto.userId,
        tx,
      );
      const totalDed = manualDed.add(loanDeduction);

      // V19.16 — commission roll-up: pull RELEASED payouts earned up to
      // this cut date. We read them here BEFORE creating the payroll row
      // so we know the total in advance; the mark-paid update runs after
      // the row exists so we can stamp the correct `payrollId`.
      const commissionSnapshot =
        await this.commissionPayouts.sumReleasedForUser(
          dto.userId,
          paymentDate,
        );
      const commission = new Prisma.Decimal(commissionSnapshot.sumKd);

      // V19.17 — auto-flip HELD→RELEASED for any slips whose underlying
      // customer debt has been collected. We still call this so statuses
      // stay accurate, but the returned amount is NO LONGER bundled into
      // the payroll. Release is now a voucher-style disbursement handled
      // by `DebtHoldsService.markDisbursed` from the Debt-Holds page,
      // matching the Owner workflow (salary pays out first; release is
      // stamped on its own schedule).
      await this.debtHolds.releaseSettledHolds(dto.userId, tx);
      const debtRelease = new Prisma.Decimal(0);

      // V19.16 — fresh debt-hold for the current open customer debt.
      const newHoldSnap = await this.debtHolds.buildHoldSnapshotForPayroll(
        dto.userId,
      );
      const autoHold = newHoldSnap
        ? newHoldSnap.holdAmount
        : new Prisma.Decimal(0);

      // V19.17 — absorb any pending manual (unlinked) HELD slips for
      // this employee. These were created via the "حجز يدوي" dialog
      // before the payroll existed; we fold their sum into
      // `debtHoldAmount` and stamp each row with the new payroll id so
      // the saved payslip reflects the actual deduction instead of
      // showing "—" while the ledger silently withholds the cash.
      const untiedHolds = await tx.debtHold.findMany({
        where: {
          employeeUserId: dto.userId,
          status: 'HELD',
          payrollId: null,
        },
        select: { id: true, holdAmount: true },
      });
      const untiedSum = untiedHolds.reduce(
        (acc, h) => acc.add(new Prisma.Decimal(h.holdAmount.toString())),
        new Prisma.Decimal(0),
      );
      const debtHold = autoHold.add(untiedSum);

      const payroll = await tx.payroll.create({
        data: {
          userId: dto.userId,
          branchId: dto.branchId,
          basicSalary: basic,
          allowances: allow,
          deductions: totalDed,
          commissionAmount: commission.toFixed(4),
          debtHoldAmount: debtHold.toFixed(4),
          debtReleaseAmount: debtRelease.toFixed(4),
          paymentDate,
          status: PayrollStatus.PENDING,
        },
        include: {
          user: { select: { id: true, fullName: true, username: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      // Stamp matched commission rows as PAID on this payroll id. This
      // runs after the Payroll row exists so the foreign key is valid.
      if (commissionSnapshot.payoutIds.length > 0) {
        await this.commissionPayouts.markPaidForPayroll(
          commissionSnapshot.payoutIds,
          payroll.id,
          tx,
        );
      }

      // Persist the fresh auto-hold slip tied to this payroll (if any).
      if (newHoldSnap) {
        await this.debtHolds.persistHold(
          {
            employeeUserId: dto.userId,
            payrollId: payroll.id,
            debtAmount: newHoldSnap.debtAmount,
            holdAmount: newHoldSnap.holdAmount,
            holdMode: newHoldSnap.holdMode,
          },
          tx,
        );
      }

      // Link every absorbed manual hold to the new payroll so the
      // payslip audit trail points back to exactly which holds were
      // applied this run. Batched update keeps this O(1) round trip.
      if (untiedHolds.length > 0) {
        await tx.debtHold.updateMany({
          where: { id: { in: untiedHolds.map((h) => h.id) } },
          data: { payrollId: payroll.id },
        });
      }

      return payroll;
    });
  }

  async markPaid(actorRole: SafariRole, id: string) {
    this.assertOwnerOrManager(actorRole);
    const row = await this.prisma.payroll.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Payroll not found');
    return this.prisma.payroll.update({
      where: { id },
      data: { status: PayrollStatus.PAID, paymentDate: new Date() },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async list(
    actorRole: SafariRole,
    fromIso: string,
    toIso: string,
    branchId?: string,
  ) {
    if (
      actorRole !== SafariRole.OWNER &&
      actorRole !== SafariRole.GENERAL_MANAGER &&
      actorRole !== SafariRole.MANAGER &&
      actorRole !== SafariRole.ACCOUNTANT
    ) {
      throw new ForbiddenException();
    }
    const from = new Date(fromIso);
    const to = new Date(toIso);
    return this.prisma.payroll.findMany({
      where: {
        paymentDate: { gte: from, lte: to },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { paymentDate: 'desc' },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Fetch a single payroll row with user + branch details, used by the
   * A4 printable payslip page. OWNER / GM / MANAGER / ACCOUNTANT may
   * fetch any row; employees may only fetch their own.
   */
  async findOne(actorRole: SafariRole, actorUserId: string, id: string) {
    const row = await this.prisma.payroll.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            employeeId: true,
            civilId: true,
            nationality: true,
            address: true,
            bankName: true,
            bankIban: true,
            hireDate: true,
            jobTitle: true,
          },
        },
        branch: { select: { id: true, name: true, location: true } },
      },
    });
    if (!row) throw new NotFoundException('Payroll not found');
    const canReadAll =
      actorRole === SafariRole.OWNER ||
      actorRole === SafariRole.GENERAL_MANAGER ||
      actorRole === SafariRole.MANAGER ||
      actorRole === SafariRole.ACCOUNTANT;
    if (!canReadAll && row.userId !== actorUserId) {
      throw new ForbiddenException();
    }
    return row;
  }

  /** Sum of net pay for PAID payrolls with paymentDate in [from, to]. */
  async sumPaidNetInRange(
    from: Date,
    to: Date,
    branchId?: string,
  ): Promise<string> {
    const rows = await this.prisma.payroll.findMany({
      where: {
        status: PayrollStatus.PAID,
        paymentDate: { gte: from, lte: to },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        basicSalary: true,
        allowances: true,
        deductions: true,
        commissionAmount: true,
        debtHoldAmount: true,
        debtReleaseAmount: true,
      },
    });
    let total = new Prisma.Decimal(0);
    for (const r of rows) {
      total = total.add(netPay(r));
    }
    return total.toFixed(4);
  }
}
