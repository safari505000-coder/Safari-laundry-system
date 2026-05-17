import { Prisma } from '@prisma/client';
import { DebtSource } from './enums/debt-source.enum';

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
/**
 * بادئات مراجع مصادر المدفوعات النقدية الحقيقية التي تُخفّض المديونية
 * Real cash-equivalent payment sourceRef prefixes that reduce customer AR.
 * Wallet absorption rows are intentionally excluded (see WALLET_ABSORPTION_SOURCE_REF_PREFIXES).
 * @since V20.1
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
/**
 * بادئات مراجع مصادر امتصاص المحفظة — للتدقيق فقط ولا تُخفّض المديونية
 * Wallet absorption tracking PAYMENT sourceRef prefixes. Audit-only; never reduce AR.
 * @since V20.1
 */
export const WALLET_ABSORPTION_SOURCE_REF_PREFIXES = [
  'PAYMENT:WALLET:',
  'PAYMENT:WALLET:BACKFILL:',
] as const;

/** Union of every prefix that is allowed at a PAYMENT write site. */
const ALLOWED_PAYMENT_SOURCE_REF_PREFIXES = [
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

/**
 * نوع صف المدفوعات الشبيهة بدفتر الالتزام للتحقق من الأصل
 * Duck-typed payment entry structure for payment-origin validation functions.
 */
export type DebtPaymentLike = {
  source: DebtSource | string;
  amount: Prisma.Decimal | number | string;
  actorUserId?: string | null;
  sourceRef?: string | null;
  note?: string | null;
};

/**
 * يتحقق من أن صف دفتر الالتزام هو دفعة نقدية حقيقية تُخفّض المديونية
 * Returns true when the entry is a cash-equivalent payment that reduces customer AR.
 * Wallet absorption rows return false — they are valid audit entries but not AR-reducing.
 *
 * @param entry - صف المدفوعات للتحقق منه | Payment entry to validate
 * @returns true إذا كانت دفعة حقيقية | Whether this is a real AR-reducing payment
 * @since V20.1
 */
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
/**
 * يتحقق من أن صف دفتر الالتزام هو قيد امتصاص محفظة للتدقيق فقط
 * Returns true when the entry is a wallet-absorption tracking PAYMENT (audit-only;
 * not subtracted from AR/debt).
 *
 * @param entry - صف المدفوعات للتحقق منه | Payment entry to check
 * @returns true إذا كان قيد امتصاص محفظة | Whether this is a wallet absorption entry
 * @since V20.1
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

/**
 * يتحقق من صحة كتابة المدفوعات في دفتر الالتزام — يرمي استثناء عند الانتهاك
 * Asserts that a PAYMENT write to the debt ledger has a valid sourceRef and actorUserId.
 * Throws on invalid or missing payment origin. Never mutates state.
 *
 * @param input - بيانات الكتابة للتحقق منها | Write input to validate
 * @throws Error إذا كان المرجع أو المستخدم مفقوداً أو غير صالح | On missing/invalid origin
 */
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

/**
 * يُسجّل عملية كتابة في دفتر الالتزام للتتبع والتدقيق
 * Traces a debt ledger payment write for observability.
 *
 * @param input - بيانات التتبع | Trace input
 */
export function traceDebtLedgerPaymentWrite(input: {
  sourceFile: string;
  functionName: string;
  payload: Record<string, unknown>;
}): void {
  void input;
}
