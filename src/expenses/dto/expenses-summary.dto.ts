import { ExpenseCategory } from '@prisma/client';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

/**
 * STRICT ROLE-BASED EXPENSE DESIGN — Part 6 (Unified Expense Calculation / SSoT).
 *
 * Every numeric total in any expense report or financial dashboard MUST
 * come from `GET /api/finance/expenses-summary`. Frontends are forbidden
 * from running `reduce() / sum() / manual %` over expense rows — see the
 * ESLint guard in `web/eslint.config.js`.
 *
 * The endpoint is restricted to OWNER, GENERAL_MANAGER and ACCOUNTANT
 * (PART 7 — strict role permissions). Branch managers never receive
 * aggregated financial data.
 */

export class ExpensesSummaryQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/**
 * Owner type discriminator computed (NOT stored).
 *
 *   BRANCH  — recordedBy is MANAGER (cleaning, supplies, utilities, …)
 *   DRIVER  — recordedBy is DRIVER (fuel, car maintenance, …)
 *   COMPANY — recordedBy is OWNER / GENERAL_MANAGER / ACCOUNTANT
 *             (admin-level expenses with no branch attribution)
 *
 * The discriminator is derived in `ExpensesService.deriveOwnerType` so
 * the database stays the single source of truth. Adding a redundant
 * column would create the same drift risk we eliminated in the cash
 * SSoT work — see `docs/proposals/order-actor-vs-driver-migration.md`.
 */
export type ExpenseOwnerType = 'BRANCH' | 'DRIVER' | 'COMPANY';

export class ExpensesSummaryByOwnerDto {
  ownerType!: ExpenseOwnerType;
  totalKd!: string;
  count!: number;
}

export class ExpensesSummaryByCategoryDto {
  category!: ExpenseCategory;
  totalKd!: string;
  count!: number;
}

export class ExpensesSummaryByBranchDto {
  branchId!: string | null;
  branchName!: string | null;
  totalKd!: string;
  count!: number;
}

/**
 * V24 — Wave B (Frontend Purge) addition.
 *
 * Per-driver / per-recorder breakdown so the dashboard and the
 * weekly printable report can render the "أعلى موظف من حيث
 * المصروفات" badge without the FE re-aggregating raw expense rows
 * (which was the job of the deleted `expense-analytics.ts`).
 */
export class ExpensesSummaryByDriverDto {
  recordedById!: string;
  recordedByName!: string;
  totalKd!: string;
  count!: number;
}

/**
 * V24 — Wave B (Frontend Purge) addition.
 *
 * Car-vs-other split that the FE used to compute via
 * `isCarExpense(row)` for every row before reducing. Backend
 * derives the same split by treating `FUEL` as the "car" bucket
 * (the only car-shaped value in the actual `ExpenseCategory`
 * enum). Percentages travel as basis points (integer 0..10000) to
 * keep the wire shape canonical.
 */
export class ExpensesSummaryCarBreakdownDto {
  carTotalKd!: string;
  carCount!: number;
  otherTotalKd!: string;
  otherCount!: number;
  /** Car share of approved expenses, in basis points (0..10000). */
  carShareBps!: number;
}

export class ExpensesSummaryMonthlyDto {
  month!: string; // YYYY-MM
  totalKd!: string;
  driverKd!: string;
  branchKd!: string;
  companyKd!: string;
}

export class ExpensesSummaryAlertDto {
  id!: string;
  severity!: 'info' | 'warning' | 'critical';
  message!: string;
}

export class ExpensesSummaryResponseDto {
  source!: 'api/finance/expenses-summary';
  rangeFromIso!: string;
  rangeToIso!: string;
  branchScope!: string | null;

  totalApprovedKd!: string;
  totalPendingKd!: string;
  approvedCount!: number;

  byOwnerType!: ExpensesSummaryByOwnerDto[];
  byCategory!: ExpensesSummaryByCategoryDto[];
  byBranch!: ExpensesSummaryByBranchDto[];
  byDriver!: ExpensesSummaryByDriverDto[];
  carBreakdown!: ExpensesSummaryCarBreakdownDto;
  monthly!: ExpensesSummaryMonthlyDto[];
  alerts!: ExpensesSummaryAlertDto[];
}
