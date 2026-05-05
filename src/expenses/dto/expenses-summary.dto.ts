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
  monthly!: ExpensesSummaryMonthlyDto[];
  alerts!: ExpensesSummaryAlertDto[];
}
