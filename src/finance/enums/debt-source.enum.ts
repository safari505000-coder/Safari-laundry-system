/**
 * مُعرِّف مصدر دين قاعدة البيانات — مُستقل عن Prisma بعد إزالة جدول DebtLedgerEntry
 * TypeScript-native DebtSource enum matching PostgreSQL enum values.
 * Decoupled from @prisma/client so DebtLedgerEntry can be dropped without breaking the type system.
 * @since V20.4
 */
export enum DebtSource {
  SUBSCRIPTION_OVERUSE = 'SUBSCRIPTION_OVERUSE',
  INVOICE_SHORTFALL = 'INVOICE_SHORTFALL',
  PAYMENT = 'PAYMENT',
}
