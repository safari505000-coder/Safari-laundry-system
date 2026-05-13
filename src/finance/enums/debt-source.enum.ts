/**
 * V20.4 — TypeScript-native DebtSource enum.
 *
 * Identical values to the former Prisma enum of the same name.
 * Decoupled from `@prisma/client` so the DebtLedgerEntry table can be
 * fully dropped without breaking the type system.
 *
 * The string values match the PostgreSQL enum literals (`PAYMENT`, etc.)
 * so Prisma WHERE clauses that still reference `DebtLedgerEntry.source`
 * during the migration window continue to work via string compatibility.
 */
export enum DebtSource {
  SUBSCRIPTION_OVERUSE = 'SUBSCRIPTION_OVERUSE',
  INVOICE_SHORTFALL = 'INVOICE_SHORTFALL',
  PAYMENT = 'PAYMENT',
}
