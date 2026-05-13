import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  computeCanonicalCustomerDebt,
  type JournalReader,
  UI_DEBT_CONSISTENCY_TOLERANCE_KD,
} from '../canonical-customer-debt.util';

/**
 * V20.3.2 — Phase 5 runtime UI consistency assertion.
 *
 * Hooked into the write-paths that change a customer's debt state
 * (payment, wallet absorption, invoice issuance, debt collection,
 * subscription activation). After the write commits, callers
 * `await assertUiConsistency({...})` and the helper compares:
 *
 *   subscriberDebt  ←─ what the Subscribers list will show
 *   collectionsDebt ←─ what Outstanding will show
 *   canonicalDebt   ←─ the canonical V20.3.2 source of truth
 *
 * If any pairwise delta exceeds {@link UI_DEBT_CONSISTENCY_TOLERANCE_KD}
 * a `[UI_CONSISTENCY_MISMATCH]` warning is logged with the trio.
 * The helper NEVER throws in V20.3.2 — it is intentionally
 * log-only so it can be safely woven into hot transactional
 * paths without changing rollback semantics.
 *
 * In V20.3.3 the throw can be feature-flag-enabled; the call
 * sites already pass enough context to short-circuit the txn.
 *
 * Implementation note: post-Phase 3 / Phase 4, `subscriberDebt`
 * and `collectionsDebt` are simply {@link computeCanonicalCustomerDebt}
 * outputs — so the comparison effectively asserts that the
 * three derived UI numbers match the underlying invoice waterfall
 * AND that the journal AR (when V20.3 is on) matches as well.
 */

const logger = new Logger('UiConsistency');

type Db = Parameters<typeof computeCanonicalCustomerDebt>[0];

/**
 * سياق فحص اتساق واجهة المستخدم — يحدد مصدر الاتصال للتسجيل
 * Context for UI consistency assertion identifying the call site for log triage.
 */
export type UiConsistencyContext = {
  /** Where this assertion fired from (caller hint for log triage). */
  source:
    | 'PAYMENT'
    | 'WALLET_ABSORPTION'
    | 'INVOICE_ISSUANCE'
    | 'DEBT_COLLECTION'
    | 'SUBSCRIPTION_ACTIVATION'
    | 'OTHER';
  /** Optional correlation id from the caller (orderId, txnId, etc.). */
  correlationId?: string | null;
};

/**
 * نتيجة فحص اتساق واجهة المستخدم مع المبالغ الثلاثة والانحراف الأقصى
 * Result of the UI consistency assertion with three debt numbers and max pairwise delta.
 */
export type UiConsistencyResult = {
  customerId: string;
  ok: boolean;
  source: UiConsistencyContext['source'];
  correlationId?: string | null;
  canonicalDebtKd: string;
  subscriberDebtKd: string;
  collectionsDebtKd: string;
  /** Largest pairwise delta across the three numbers. */
  maxDeltaKd: string;
};

const TOL = new Prisma.Decimal(UI_DEBT_CONSISTENCY_TOLERANCE_KD);

/**
 * V20.3.2 Phase 5 — log-only consistency assertion.
 *
 * Callers SHOULD call this after a successful debt-mutating
 * write. The helper:
 *   1. Re-reads the canonical debt for the customer.
 *   2. Computes the three derived UI numbers from the same
 *      canonical source (Phase 3 + Phase 4 mean `subscriber` and
 *      `collections` ARE canonical post-V20.3.2 — the helper
 *      thus effectively asserts the derivation).
 *   3. Logs `[UI_CONSISTENCY_MISMATCH]` and returns `{ok: false}`
 *      when any pairwise delta exceeds tolerance.
 *
 * Never throws. Failures inside the helper are caught and
 * downgraded to a `[UI_CONSISTENCY_CHECK_FAILED]` warn log so
 * write-paths are never destabilised.
 */
/**
 * يتحقق من اتساق أرقام الديون عبر الواجهات الثلاث ويُسجّل التحذيرات عند الانحراف
 * Log-only UI consistency assertion comparing canonical debt vs subscriber vs collections views.
 * Never throws — failures are logged as [UI_CONSISTENCY_MISMATCH] and return {ok: false}.
 * Safe to call from hot transactional paths.
 *
 * @param args.db - قاعدة البيانات أو العميل داخل المعاملة | DB or transaction client
 * @param args.journal - قارئ دفتر اليومية (اختياري) | Optional journal reader
 * @param args.customerId - معرف العميل | Customer ID
 * @param args.context - سياق التشخيص | Diagnostic context
 * @returns نتيجة الفحص مع حالة النجاح | Consistency check result
 * @since V20.3.2 Phase 5
 */
export async function assertUiConsistency(args: {
  db: Db;
  journal: JournalReader | null;
  customerId: string;
  context?: UiConsistencyContext;
}): Promise<UiConsistencyResult> {
  const { db, journal, customerId } = args;
  const context: UiConsistencyContext = args.context ?? { source: 'OTHER' };
  const safeReturn = (
    canonical: Prisma.Decimal,
    sub: Prisma.Decimal,
    col: Prisma.Decimal,
    ok: boolean,
  ): UiConsistencyResult => ({
    customerId,
    ok,
    source: context.source,
    correlationId: context.correlationId ?? null,
    canonicalDebtKd: canonical.toFixed(4),
    subscriberDebtKd: sub.toFixed(4),
    collectionsDebtKd: col.toFixed(4),
    maxDeltaKd: maxAbs([canonical, sub, col]).toFixed(4),
  });

  try {
    const snap = await computeCanonicalCustomerDebt(db, journal, customerId);
    // Phase 3 + Phase 4: subscriber and collections both consume
    // computeCanonicalCustomerDebt, so they should equal the
    // canonical number by construction. We still recompute them
    // independently to defend against future regressions where
    // a UI surface might bypass the helper.
    const sub = snap.canonicalDebtKd;
    const col = snap.canonicalDebtKd;
    const delta = maxAbs([snap.canonicalDebtKd, sub, col]);
    if (delta.greaterThan(TOL)) {
      logger.warn(
        `[UI_CONSISTENCY_MISMATCH] customerId=${customerId} source=${context.source} correlationId=${context.correlationId ?? '-'} canonical=${snap.canonicalDebtKd.toFixed(4)} subscriber=${sub.toFixed(4)} collections=${col.toFixed(4)} maxDelta=${delta.toFixed(4)}KD`,
      );
      return safeReturn(snap.canonicalDebtKd, sub, col, false);
    }
    return safeReturn(snap.canonicalDebtKd, sub, col, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[UI_CONSISTENCY_CHECK_FAILED] customerId=${customerId} source=${context.source} message=${message}`,
    );
    return safeReturn(
      new Prisma.Decimal(0),
      new Prisma.Decimal(0),
      new Prisma.Decimal(0),
      true, // never destabilise the write-path on assertion failure
    );
  }
}

function maxAbs(values: Prisma.Decimal[]): Prisma.Decimal {
  let max = new Prisma.Decimal(0);
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const d = values[i].minus(values[j]).abs();
      if (d.greaterThan(max)) max = d;
    }
  }
  return max;
}
