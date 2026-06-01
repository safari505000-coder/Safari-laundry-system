/**
 * Raised by {@link FinancialIntegrityService} whenever a financial
 * integrity rule is violated. It is deliberately a hard error (not a
 * NestJS HttpException) so that when it is thrown inside a business
 * `$transaction` the transaction ROLLS BACK — enforcing the
 * "no partial success" policy: no save, no post, no balance update,
 * no ledger entry.
 *
 * `code` is a stable machine-readable token for tests / alerts.
 */
export type FinancialIntegrityViolationCode =
  | 'UNBALANCED_ENTRY'
  | 'NEGATIVE_LINE'
  | 'AMBIGUOUS_LINE'
  | 'EMPTY_LINE'
  | 'MINIMUM_TWO_LINES'
  | 'DUPLICATE_POSTING'
  | 'DOUBLE_SETTLEMENT'
  | 'DOUBLE_REVERSAL'
  | 'NEGATIVE_BALANCE'
  | 'BROKEN_ACCOUNTING_CHAIN';

export class FinancialIntegrityError extends Error {
  readonly code: FinancialIntegrityViolationCode;
  readonly detail?: Record<string, unknown>;

  constructor(
    code: FinancialIntegrityViolationCode,
    message: string,
    detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'FinancialIntegrityError';
    this.code = code;
    this.detail = detail;
    Object.setPrototypeOf(this, FinancialIntegrityError.prototype);
  }
}
