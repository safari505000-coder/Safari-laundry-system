/**
 * فئة كيان الدين — تُصنّف المديونية حسب الجهة المُصدِرة
 * Debt entity category classifying debt by the issuing entity type.
 */
export enum DebtEntityCategory {
  BRANCH = 'BRANCH',
  DRIVER = 'DRIVER',
  OWNER = 'OWNER',
  CALL_CENTER = 'CALL_CENTER',
}
