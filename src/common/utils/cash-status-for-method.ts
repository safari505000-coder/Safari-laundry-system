import { CashStatus, PosPaymentMethod } from '@prisma/client';

/**
 * V19.11.3 — Map a POS payment method to the cash-trail state it should
 * leave on the `Order` row when the order is marked COMPLETED.
 *
 * Background
 * ----------
 * Historically, every completed POS order was stamped with
 * `CashStatus.PAID_TO_DRIVER` — even electronic ones such as KNET and
 * hosted-link gateway sales. That made the "driver cash" reports and
 * the daily collector panels count electronic money as if it had
 * physically landed in the driver's pocket, which is wrong: the driver
 * never received a fils, and the money needed no handover.
 *
 * The gap becomes visible in two places:
 *   • `/drivers/cash-trace` and `DailyCollectorPanel` appeared to show
 *     KNET totals as "pending with driver".
 *   • `confirmHandover` had to defensively re-filter on
 *     `posPaymentMethod: CASH` to avoid flipping KNET orders to
 *     HANDED_OVER_TO_OFFICE.
 *
 * This helper returns the correct state for the underlying channel:
 *   • `PAID_ONLINE`   — money settled electronically (KNET terminal,
 *     hosted payment link, generic ONLINE callback). No handover ever
 *     required; these orders should NOT appear in driver-cash trails.
 *   • `PAID_TO_DRIVER` — everything else, including CASH, DEBT_ON_ACCOUNT
 *     (the driver holds the paper trail and must eventually reconcile),
 *     and subscription-wallet closures (the driver is still accountable
 *     for the service delivery). Legacy behaviour preserved.
 *
 * All new writes to `Order.cashStatus` should go through this helper so
 * future payment-method additions are forced to make an explicit choice.
 */
export function cashStatusForPaymentMethod(
  method: PosPaymentMethod | null | undefined,
): CashStatus {
  switch (method) {
    case PosPaymentMethod.KNET:
    case PosPaymentMethod.PAYMENT_LINK:
    case PosPaymentMethod.ONLINE:
      return CashStatus.PAID_ONLINE;
    case PosPaymentMethod.CASH:
    case PosPaymentMethod.DEBT_ON_ACCOUNT:
    case PosPaymentMethod.SUBSCRIPTION_WALLET:
    default:
      return CashStatus.PAID_TO_DRIVER;
  }
}

/**
 * Convenience predicate — true for any method that is settled off-driver.
 * Kept alongside the mapper so call sites that need both (e.g. reports
 * that bucket "electronic" vs "cash") only have one import.
 */
export function isElectronicMethod(
  method: PosPaymentMethod | null | undefined,
): boolean {
  return (
    method === PosPaymentMethod.KNET ||
    method === PosPaymentMethod.PAYMENT_LINK ||
    method === PosPaymentMethod.ONLINE
  );
}
