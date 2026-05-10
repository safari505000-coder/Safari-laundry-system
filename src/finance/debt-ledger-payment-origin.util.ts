import { DebtSource, Prisma } from '@prisma/client';

/**
 * V20.1 — "Real money" PAYMENT prefixes. A row tagged with one of these
 * IS a cash-equivalent settlement and reduces customer AR (FIFO + KPI math).
 *
 * Wallet-absorption PAYMENTs are intentionally NOT in this list: see
 * `WALLET_ABSORPTION_SOURCE_REF_PREFIXES` below. They are valid ledger
 * rows (audit trail of wallet credit applied to an invoice), but they do
 * not reduce the customer's outstanding debt because the corresponding
 * INVOICE_SHORTFALL is already recorded as the *remainder* (post-wallet),
 * not the gross invoice. Counting them as AR-reducing would double-credit.
 */
export const REAL_PAYMENT_SOURCE_REF_PREFIXES = [
  'PAYMENT:CASH:',
  'PAYMENT:KNET:',
  'PAYMENT:ONLINE:',
  'PAYMENT:PAYMENT_LINK:',
  'PAYMENT:CALL_CENTER_MANUAL:',
  'PAYMENT:PAYMENT_LINK_CALLBACK:',
  'PAYMENT:SUBSCRIPTION_ACTIVATION:',
  'PAYMENT:CC_DEBT_INVOICE_PHYSICAL:',
  'PAYMENT:CC_PARTIAL_DEBT_PAYMENT:',
] as const;

/**
 * V20.1 — Wallet absorption tracking PAYMENT prefixes. Recorded for
 * audit + customer statements (so we can answer "how much of this
 * invoice was paid by wallet credit?"), but NEVER subtracted from
 * the AR/debt aggregate. Use {@link isWalletAbsorptionLedgerEntry}
 * to detect these rows in reports.
 *
 * Background: see audit V20-FORENSIC §C-1. The natural POS path
 * historically deducted CustomerWallet.balance with no compensating
 * DebtLedger entry, so the wallet drain was invisible to AR /
 * Customer-360 / Subscribers. These rows close that gap without
 * re-counting any money against the receivable.
 */
export const WALLET_ABSORPTION_SOURCE_REF_PREFIXES = [
  'PAYMENT:WALLET:',
  'PAYMENT:WALLET:BACKFILL:',
] as const;

/** Union of every prefix that is allowed at a PAYMENT write site. */
export const ALLOWED_PAYMENT_SOURCE_REF_PREFIXES = [
  ...REAL_PAYMENT_SOURCE_REF_PREFIXES,
  ...WALLET_ABSORPTION_SOURCE_REF_PREFIXES,
] as const;

const NON_MONEY_SOURCE_REF_PREFIXES = [
  'ADJUSTMENT:',
  'REFUND:',
  'WRITE_OFF:',
  'TRANSFER:',
  'MIGRATION:',
] as const;

const NON_MONEY_NOTE_PATTERNS = [
  'reversed by invoice void',
  'invoice void',
  'invoice edit',
  'write-off',
  'migration',
] as const;

export type DebtPaymentLike = {
  source: DebtSource | string;
  amount: Prisma.Decimal | number | string;
  actorUserId?: string | null;
  sourceRef?: string | null;
  note?: string | null;
};

export function isRealDebtLedgerPayment(entry: DebtPaymentLike): boolean {
  if (entry.source !== DebtSource.PAYMENT && entry.source !== 'PAYMENT') {
    return false;
  }

  const amount = new Prisma.Decimal(entry.amount.toString());
  if (amount.lessThanOrEqualTo(0)) return false;

  const sourceRef = entry.sourceRef?.trim() ?? '';
  if (
    NON_MONEY_SOURCE_REF_PREFIXES.some((prefix) =>
      sourceRef.startsWith(prefix),
    )
  ) {
    return false;
  }

  // V20.1 — Wallet absorption rows are valid PAYMENTs for audit but
  // never reduce AR. See WALLET_ABSORPTION_SOURCE_REF_PREFIXES.
  if (
    sourceRef &&
    WALLET_ABSORPTION_SOURCE_REF_PREFIXES.some((prefix) =>
      sourceRef.startsWith(prefix),
    )
  ) {
    return false;
  }

  if (
    sourceRef &&
    REAL_PAYMENT_SOURCE_REF_PREFIXES.some((prefix) =>
      sourceRef.startsWith(prefix),
    )
  ) {
    return true;
  }

  // Legacy rows before sourceRef locking: accept only actor-backed rows
  // whose note does not identify a non-cash accounting reversal.
  if (!entry.actorUserId) return false;
  const note = entry.note?.toLowerCase() ?? '';
  return !NON_MONEY_NOTE_PATTERNS.some((pattern) => note.includes(pattern));
}

/**
 * V20.1 — true when the row is a wallet-absorption tracking PAYMENT
 * (audit-only; not subtracted from debt). Reports/UI use this to
 * answer "how much of this invoice was paid from wallet credit?".
 */
export function isWalletAbsorptionLedgerEntry(entry: DebtPaymentLike): boolean {
  if (entry.source !== DebtSource.PAYMENT && entry.source !== 'PAYMENT') {
    return false;
  }
  const ref = entry.sourceRef?.trim() ?? '';
  if (!ref) return false;
  return WALLET_ABSORPTION_SOURCE_REF_PREFIXES.some((prefix) =>
    ref.startsWith(prefix),
  );
}

export function assertDebtLedgerPaymentWrite(input: {
  source: DebtSource | string;
  actorUserId?: string | null;
  sourceRef?: string | null;
}): void {
  if (input.source !== DebtSource.PAYMENT && input.source !== 'PAYMENT') {
    return;
  }
  if (!input.sourceRef?.trim()) {
    throw new Error('PAYMENT_ORIGIN_REQUIRED');
  }
  if (!input.actorUserId) {
    throw new Error('PAYMENT_ACTOR_REQUIRED');
  }
  if (
    !ALLOWED_PAYMENT_SOURCE_REF_PREFIXES.some((prefix) =>
      input.sourceRef!.startsWith(prefix),
    )
  ) {
    throw new Error('INVALID_PAYMENT_SOURCE');
  }
}

export function traceDebtLedgerPaymentWrite(input: {
  sourceFile: string;
  functionName: string;
  payload: Record<string, unknown>;
}): void {
  console.warn('[LEDGER_WRITE_TRACE]', input);
  console.log('[PAYMENT_CREATED]', input.payload);
}
