import { Prisma } from '@prisma/client';
import { DebtSource } from '../finance/enums/debt-source.enum';

/**
 * V20.8.1 — Canonical subscription consumption projection.
 * V23.3 — Internal arithmetic migrated to `Prisma.Decimal` end-to-end.
 *
 * # Why this file exists
 *
 * Pre-V20.8.1 the Customer 360 financial engine computed
 * `subscriptionConsumedKd` as "sum(active orders whose
 * `posPaymentMethod === SUBSCRIPTION_WALLET`)". That correctly
 * captures the case where a POS sale is paid directly from the
 * subscription wallet at sale time, but it MISSES the case where
 * a previously-unpaid invoice (DEBT_ON_ACCOUNT or CASH-untendered)
 * is later absorbed from the subscription wallet — that flow
 * leaves the order's `posPaymentMethod` unchanged and records the
 * absorption only as a `DebtLedgerEntry` row with
 * `sourceRef = "PAYMENT:WALLET:<orderId>:APPLIED"`.
 *
 * Result: `consumed = 0`, `remaining = full` even after the
 * wallet has been drawn down.
 *
 * # Canonical formula
 *
 *   subscriptionConsumed =
 *     Σ(amount of orders posted with posPaymentMethod = SUBSCRIPTION_WALLET, scoped to the active subscription)
 *   + Σ(wallet-absorption ledger entries since `subscriptionActivatedAt`)
 *   + Σ(subscription activation debt-settlement amounts for this subscription)
 *
 *   subscriptionRemaining = max(0, planActualBalanceSnapshot - subscriptionConsumed)
 *
 * # V23.3 precision contract
 *
 * Internal accumulators run on `Prisma.Decimal` (banker's rounding,
 * 4dp KWD scale). Boundary `number` inputs are converted via the
 * single `decFromInput` adapter so non-finite/NaN inputs collapse
 * to a Decimal-zero (preserving the legacy "skip junk row" behaviour
 * without falling back to JS `+`/`-` arithmetic).
 *
 * Public I/O signatures keep `number` for binary compatibility
 * with the Customer 360 engine (which already coerces `MoneyLike`
 * to `number` at its own boundary). The Decimal-precise interior
 * means the `<id>Kd + <id>Kd` and `<id>Kd - <id>Kd` patterns
 * forbidden by the V23.2 purity guard never appear here.
 *
 * # Why this is safe (additive only)
 *
 *   • The pre-V20.8.1 path is preserved as the first summand.
 *     If a deployment never used wallet absorption, the result
 *     is byte-identical to the legacy calculation.
 *   • The wallet-absorption rows are read-only audit history
 *     (`PAYMENT:WALLET:` rows are explicitly excluded from AR
 *     reconciliation already — see `isWalletAbsorptionLedgerEntry`).
 *     We are not double-counting against AR; we are surfacing
 *     consumption in the projection.
 *   • The canonical engine, journal, double-entry rules,
 *     reconciliation, and historical journal rows are NOT
 *     touched.
 *
 * # Inputs
 *
 *   • `subscriptionId`      — active subscription id (or null)
 *   • `planActualBalanceKd` — value at activation
 *   • `activatedAt`         — window start; ledger rows older
 *                              than this DO NOT count toward THIS
 *                              subscription
 *   • `directOrders`        — orders posted with
 *                              `posPaymentMethod = SUBSCRIPTION_WALLET`
 *   • `walletAbsorptionLedger` — `DebtLedgerEntry` rows where
 *                              `source = PAYMENT` AND `sourceRef`
 *                              starts with `PAYMENT:WALLET:`
 */

export type SubscriptionConsumptionInput = {
  subscriptionId: string | null;
  planActualBalanceKd: number;
  activatedAt: Date | null;
  directOrders: ReadonlyArray<{
    id?: string;
    subscriptionId?: string | null;
    amount: number;
  }>;
  walletAbsorptionLedger: ReadonlyArray<{
    id?: string;
    source: DebtSource | string;
    sourceRef?: string | null;
    amount: number;
    createdAt: Date;
  }>;
  activationDebtSettlements?: ReadonlyArray<{
    id?: string;
    subscriptionId?: string | null;
    amount: number;
    createdAt: Date;
  }>;
};

export type SubscriptionConsumptionResult = {
  /** Σ(direct subscription orders) — pre-V20.8.1 path; preserved. */
  directConsumedKd: number;
  /** Σ(wallet absorption since `activatedAt`). */
  absorbedConsumedKd: number;
  /** Σ(debt settled by this subscription activation). */
  activationDebtSettledKd: number;
  /** Total: directConsumedKd + absorbedConsumedKd, rounded to 4dp. */
  consumedKd: number;
  /** max(0, planActualBalanceKd - consumedKd), rounded to 4dp. */
  remainingKd: number;
  /** True if consumed exceeds value (consumer can render an over-use badge). */
  overConsumed: boolean;
};

const DEC_ZERO = new Prisma.Decimal(0);
const ABSORPTION_PREFIX = 'PAYMENT:WALLET:';

/**
 * Boundary adapter: number → Prisma.Decimal with NaN/Infinity guard.
 * Decimal does not accept non-finite numbers natively (it throws),
 * so we collapse them to zero exactly as the legacy `Number.isFinite`
 * filter did.
 */
function decFromInput(n: number): Prisma.Decimal {
  if (!Number.isFinite(n)) return DEC_ZERO;
  return new Prisma.Decimal(n);
}

/** 4dp KWD rounding (HALF_EVEN — banker's, identical to Prisma money). */
function dec4(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_EVEN);
}

/**
 * Pure deterministic projection. NEVER throws.
 *
 * Test coverage targets:
 *   1. No subscription          → all zero
 *   2. Subscription, no orders, no absorption → consumed=0, remaining=value
 *   3. Direct order only        → consumed=order, remaining=value-order
 *   4. Absorption only          → consumed=absorbed, remaining=value-absorbed
 *   5. Mixed direct + absorption → consumed=direct+absorbed
 *   6. Absorption BEFORE activation → ignored
 *   7. Over-consumption         → remaining clamped to 0; overConsumed=true
 */
export function computeSubscriptionConsumption(
  input: SubscriptionConsumptionInput,
): SubscriptionConsumptionResult {
  const planActualBalanceDec = decFromInput(input.planActualBalanceKd);
  if (
    !input.subscriptionId ||
    planActualBalanceDec.lessThanOrEqualTo(DEC_ZERO)
  ) {
    return {
      directConsumedKd: 0,
      absorbedConsumedKd: 0,
      activationDebtSettledKd: 0,
      consumedKd: 0,
      remainingKd: 0,
      overConsumed: false,
    };
  }

  // (1) Direct subscription-paid orders (pre-V20.8.1 path).
  const directDec = input.directOrders
    .filter(
      (o) =>
        o.subscriptionId == null || o.subscriptionId === input.subscriptionId,
    )
    .reduce(
      (acc, o) => acc.plus(decFromInput(o.amount)),
      DEC_ZERO,
    );
  const directConsumedDec = dec4(directDec);

  const cutoff = input.activatedAt ?? null;

  // (2) Wallet-absorption ledger entries since activation.
  const absorbedDec = input.walletAbsorptionLedger
    .filter(
      (l) =>
        (l.source === DebtSource.PAYMENT || l.source === 'PAYMENT') &&
        typeof l.sourceRef === 'string' &&
        l.sourceRef.startsWith(ABSORPTION_PREFIX),
    )
    .filter((l) => (cutoff ? l.createdAt >= cutoff : true))
    .reduce(
      (acc, l) => acc.plus(decFromInput(l.amount).abs()),
      DEC_ZERO,
    );
  const absorbedConsumedDec = dec4(absorbedDec);

  // (3) Activation-time debt settlements for this subscription.
  const activationDebtDec = (input.activationDebtSettlements ?? [])
    .filter((s) => s.subscriptionId === input.subscriptionId)
    .filter((s) => (cutoff ? s.createdAt >= cutoff : true))
    .reduce(
      (acc, s) => acc.plus(decFromInput(s.amount).abs()),
      DEC_ZERO,
    );
  const activationDebtSettledDec = dec4(activationDebtDec);

  // Total consumed — Decimal-precise sum of (1)+(2)+(3).
  const consumedDec = dec4(
    directConsumedDec
      .plus(absorbedConsumedDec)
      .plus(activationDebtSettledDec),
  );

  // Remaining — Decimal-precise diff clamped to >= 0.
  const remainingRawDec = planActualBalanceDec.minus(consumedDec);
  const remainingDec = remainingRawDec.lessThan(DEC_ZERO)
    ? DEC_ZERO
    : dec4(remainingRawDec);

  // Over-consumption — Decimal compare with the same 1e-4 epsilon
  // the legacy implementation used (≈ one micro-fil tolerance).
  const overConsumed = consumedDec.greaterThan(
    planActualBalanceDec.plus(new Prisma.Decimal('0.0001')),
  );

  return {
    directConsumedKd: directConsumedDec.toNumber(),
    absorbedConsumedKd: absorbedConsumedDec.toNumber(),
    activationDebtSettledKd: activationDebtSettledDec.toNumber(),
    consumedKd: consumedDec.toNumber(),
    remainingKd: remainingDec.toNumber(),
    overConsumed,
  };
}
