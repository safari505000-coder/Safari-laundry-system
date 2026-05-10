/**
 * V21 Canonical Banking Core customer financial contract.
 *
 * Customer-facing financial summaries must expose canonical AR/debt and
 * server-projected breakdowns from this boundary.
 */
export {
  computeCanonicalCustomerDebt,
  type CanonicalDebtSnapshot,
  type CanonicalDebtSource,
  type JournalReader,
} from './canonical-customer-debt.util';

export {
  computeCustomer360FinancialCore,
  computeCustomerFinancials,
} from '../customers/customer-360-financials';

export type {
  Customer360FinancialBreakdownDto,
  Customer360FinancialsDto,
} from '../customers/customer-360.types';
