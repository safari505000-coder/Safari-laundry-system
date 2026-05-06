import { DebtSource, Prisma } from '@prisma/client';

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
    !REAL_PAYMENT_SOURCE_REF_PREFIXES.some((prefix) =>
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
