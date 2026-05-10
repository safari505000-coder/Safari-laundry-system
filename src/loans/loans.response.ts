import { Prisma } from '@prisma/client';
import type { LoanRow } from './loans.service';

/**
 * V21 Phase 5 — canonical loan response shape.
 *
 * The frontend prints / dashboards must NOT reconstruct any monetary
 * field locally. Previously the print page computed
 *   `paid = max(0, amount − remaining)`
 * after coercing the strings to numbers via `Number()`. That is
 * frontend financial reconstruction and was the last legacy site on
 * the loan print surface.
 *
 * `mapLoanResponse` keeps the entire Prisma payload but appends a
 * `paidKd` field computed in Decimal precision (4dp) on the backend.
 * The frontend now renders the value verbatim through the canonical
 * `formatKwdLabel` from `@/lib/kwd`.
 */

export type LoanResponse = LoanRow & {
  paidKd: string;
};

export function mapLoanResponse(row: LoanRow): LoanResponse {
  const amount = new Prisma.Decimal(row.amount);
  const remaining = new Prisma.Decimal(row.remaining);
  const paid = amount.sub(remaining);
  const paidKd = (paid.lte(0) ? new Prisma.Decimal(0) : paid).toFixed(4);
  return { ...row, paidKd };
}

export function mapLoanResponses(rows: LoanRow[]): LoanResponse[] {
  return rows.map(mapLoanResponse);
}
