/**
 * نقطة الدخول الكانونية للعمليات المالية بالدينار الكويتي — إعادة تصدير الدوال المُراجَعة
 * V21 Canonical Banking Core money contract.
 * The ONLY backend money display contract new financial consumers should import.
 * Re-exports audited money helpers from finance-money.ts without changing arithmetic.
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
