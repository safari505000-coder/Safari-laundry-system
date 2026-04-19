/**
 * Frontend finance engine for the POS / Driver checkout flow.
 *
 * Constitution V5.3: every invoice is materialized with explicit service
 * rows instead of folding fees into an opaque `totalPrice`:
 *   • `DELIVERY_INSIDE_AREA` is always appended to the line-items payload.
 *     - 0.250 KWD on the first filled sub-order of a collection trip.
 *     - 0.000 KWD on every subsequent (attached) sub-order in the same trip.
 *   • `VIP_SERVICE` is appended only when the sub-order is flagged as VIP.
 *
 * These surcharges are kept in sync with the master tariff (`LaundryPriceListItem`)
 * but stored here as constants so the engine remains functional even if the
 * price-list endpoint is momentarily unreachable.
 */

export const DELIVERY_FEE_KD = 0.25;
export const VIP_SURCHARGE_KD = 1.0;

/** Labels rendered on the receipt + stored in `OrderLineItem.label`. */
export const DELIVERY_LINE_LABEL_AR = 'توصيل داخل المنطقة';
export const VIP_LINE_LABEL_AR = 'خدمة كبار الشخصيات';

export type FinanceCartLine = {
  label: string;
  quantity: number;
  unitPrice: number;
  neshaLevel: '100%' | '50%' | '25%' | '0%';
  foldingStyle: string;
  itemNote: string;
};

export type FinanceSubOrder = {
  lines: FinanceCartLine[];
  /** When true, a +1.000 KWD VIP surcharge row is injected on checkout. */
  vipEnabled?: boolean;
};

export type FinanceBillingSnapshot = {
  remainingBalance: string;
} | null;

export type FinancePart = {
  lineSum: number;
  vipSurcharge: number;
  deliveryForOrder: number;
  netTotal: number;
  needsExt: boolean;
  receiptLines: Array<{
    label: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    neshaLevel: '100%' | '50%' | '25%' | '0%';
    foldingStyle: string;
    itemNote: string;
  }>;
  lineItemsPayload: Array<{
    label: string;
    quantity: number;
    unitPrice: number;
  }>;
};

export function sumLinesKd(
  lines: Array<{ quantity: number; unitPrice: number }>,
): number {
  return lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
}

export function computeSessionTotals(
  subOrders: FinanceSubOrder[],
  billing: FinanceBillingSnapshot,
) {
  // Garment-only subtotal (what the customer sees as "Subtotal" / "المجموع الفرعي").
  // VIP and delivery are reported separately below so the receipt can itemize them.
  const combinedLineSubtotal = subOrders.reduce(
    (s, o) => s + sumLinesKd(o.lines),
    0,
  );
  const firstFilledSubOrderIndex = subOrders.findIndex(
    (o) => sumLinesKd(o.lines) > 0,
  );
  const balanceNum = billing ? Number.parseFloat(billing.remainingBalance) : NaN;
  const walletCoversNet =
    billing !== null &&
    Number.isFinite(balanceNum) &&
    balanceNum + 1e-9 >= combinedLineSubtotal;
  const isSubscriptionOrder = combinedLineSubtotal > 0 && walletCoversNet;
  const sessionDeliveryCharge =
    combinedLineSubtotal <= 0 || firstFilledSubOrderIndex < 0 || isSubscriptionOrder
      ? 0
      : DELIVERY_FEE_KD;

  // VIP is only billable on sub-orders that actually have garment lines (a
  // VIP toggle on an empty tab is ignored to avoid invoicing 1.000 for
  // nothing). Totals aggregate across the whole session.
  const combinedVipSurcharge = subOrders.reduce((s, o) => {
    if (!o.vipEnabled) return s;
    if (sumLinesKd(o.lines) <= 0) return s;
    return s + VIP_SURCHARGE_KD;
  }, 0);

  const grandTotal = Math.max(
    0,
    combinedLineSubtotal + sessionDeliveryCharge + combinedVipSurcharge,
  );
  return {
    combinedLineSubtotal,
    firstFilledSubOrderIndex,
    walletCoversNet,
    isSubscriptionOrder,
    sessionDeliveryCharge,
    combinedVipSurcharge,
    grandTotal,
  };
}

export function computeMultiInvoiceParts(
  nonEmptyOrdered: FinanceSubOrder[],
  billing: FinanceBillingSnapshot,
): {
  parts: FinancePart[];
  ordersPayload: Array<{
    totalPrice: number;
    lineItems: Array<{ label: string; quantity: number; unitPrice: number }>;
  }>;
  allNeedExternal: boolean;
} {
  let billingSnapshot = billing;
  const parts: FinancePart[] = [];
  const ordersPayload: Array<{
    totalPrice: number;
    lineItems: Array<{ label: string; quantity: number; unitPrice: number }>;
  }> = [];

  for (let k = 0; k < nonEmptyOrdered.length; k++) {
    const o = nonEmptyOrdered[k];
    const lineSum = sumLinesKd(o.lines);
    const isFirst = k === 0;
    const bal = billingSnapshot
      ? Number.parseFloat(billingSnapshot.remainingBalance)
      : NaN;
    const walletCoversLinesOnly = Number.isFinite(bal) && bal + 1e-9 >= lineSum;
    // First sub-order pays the 0.250 delivery; attached sub-orders carry the
    // same row at 0.000 so the DB keeps a uniform line structure across a
    // collection trip (audit-friendly, no hidden folding into totalPrice).
    const baseDel = isFirst ? DELIVERY_FEE_KD : 0;
    const deliveryForOrder =
      walletCoversLinesOnly && lineSum > 0 ? 0 : baseDel;
    const vipSurcharge = o.vipEnabled && lineSum > 0 ? VIP_SURCHARGE_KD : 0;
    const netTotal = lineSum + deliveryForOrder + vipSurcharge;
    const needsExt =
      netTotal > 0 &&
      (billingSnapshot === null || !Number.isFinite(bal) || bal + 1e-9 < netTotal);

    const garmentLines = o.lines.map((c) => ({
      label: c.label,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
    }));
    // Service rows come LAST so the Arabic receipt reads garment-first.
    const serviceRows: Array<{
      label: string;
      quantity: number;
      unitPrice: number;
    }> = [];
    if (vipSurcharge > 0) {
      serviceRows.push({
        label: VIP_LINE_LABEL_AR,
        quantity: 1,
        unitPrice: VIP_SURCHARGE_KD,
      });
    }
    // Always emit the delivery row on every invoice of a trip, even at 0.000,
    // so the audit log + manager dashboards can count "trips" reliably.
    serviceRows.push({
      label: DELIVERY_LINE_LABEL_AR,
      quantity: 1,
      unitPrice: deliveryForOrder,
    });
    const lineItemsPayload = [...garmentLines, ...serviceRows];

    const receiptLines = o.lines.map((c) => ({
      label: c.label,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      lineTotal: c.quantity * c.unitPrice,
      neshaLevel: c.neshaLevel,
      foldingStyle: c.foldingStyle,
      itemNote: c.itemNote,
    }));

    parts.push({
      lineSum,
      vipSurcharge,
      deliveryForOrder,
      netTotal,
      needsExt,
      receiptLines,
      lineItemsPayload,
    });
    ordersPayload.push({
      totalPrice: netTotal,
      lineItems: lineItemsPayload,
    });

    if (!needsExt && billingSnapshot && netTotal > 0) {
      const prev = Number.parseFloat(billingSnapshot.remainingBalance);
      billingSnapshot = {
        ...billingSnapshot,
        remainingBalance: (prev - netTotal).toFixed(4),
      };
    }
  }

  return {
    parts,
    ordersPayload,
    allNeedExternal: parts.length > 0 && parts.every((p) => p.needsExt),
  };
}

export type SubscriptionPricingInput = {
  salePrice: number | string;
  actualBalance: number | string;
};

export function computeSubscriptionTotals(input: SubscriptionPricingInput) {
  const paid = Number(input.salePrice);
  const credit = Number(input.actualBalance);
  const salePrice = Number.isFinite(paid) ? paid : 0;
  const actualBalance = Number.isFinite(credit) ? credit : 0;
  const subsidy = Math.max(0, actualBalance - salePrice);
  return { salePrice, actualBalance, subsidy };
}
