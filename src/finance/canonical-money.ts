/**
 * V21 Canonical Banking Core money contract.
 *
 * This module is the only backend money display contract new financial
 * consumers should import. It deliberately re-exports the existing audited
 * money helpers; it does not change accounting scale or ledger arithmetic.
 */
export {
  assertDeclaredMatchesLedgerMinor,
  declaredNumberToMinor,
  formatKwdAmount,
  formatKwdLabel,
  formatSignedKwdLabel,
  HANDOVER_TOLERANCE_MINOR,
  minorToAmountString,
  parseFixed4ToMinor,
  sumOrderMinors,
  toMinorFromFixed4,
  type MoneyInput,
} from './finance-money';
