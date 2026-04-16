export const DELIVERY_FEE_KD = 0.25;

export type FinanceCartLine = {
  label: string;
  quantity: number;
  unitPrice: number;
  neshaLevel: '100%' | '50%' | '0%';
  foldingStyle: string;
  itemNote: string;
};

export type FinanceSubOrder = {
  lines: FinanceCartLine[];
};

export type FinanceBillingSnapshot = {
  remainingBalance: string;
} | null;

export type FinancePart = {
  lineSum: number;
  deliveryForOrder: number;
  netTotal: number;
  needsExt: boolean;
  receiptLines: Array<{
    label: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    neshaLevel: '100%' | '50%' | '0%';
    foldingStyle: string;
    itemNote: string;
  }>;
  lineItemsPayload:
    | Array<{ label: string; quantity: number; unitPrice: number }>
    | undefined;
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
  const grandTotal = Math.max(0, combinedLineSubtotal + sessionDeliveryCharge);
  return {
    combinedLineSubtotal,
    firstFilledSubOrderIndex,
    walletCoversNet,
    isSubscriptionOrder,
    sessionDeliveryCharge,
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
    lineItems?: Array<{ label: string; quantity: number; unitPrice: number }>;
  }>;
  allNeedExternal: boolean;
} {
  let billingSnapshot = billing;
  const parts: FinancePart[] = [];
  const ordersPayload: Array<{
    totalPrice: number;
    lineItems?: Array<{ label: string; quantity: number; unitPrice: number }>;
  }> = [];

  for (let k = 0; k < nonEmptyOrdered.length; k++) {
    const o = nonEmptyOrdered[k];
    const lineSum = sumLinesKd(o.lines);
    const isFirst = k === 0;
    const bal = billingSnapshot
      ? Number.parseFloat(billingSnapshot.remainingBalance)
      : NaN;
    const walletCoversLinesOnly = Number.isFinite(bal) && bal + 1e-9 >= lineSum;
    const baseDel = isFirst ? DELIVERY_FEE_KD : 0;
    const deliveryForOrder = walletCoversLinesOnly && lineSum > 0 ? 0 : baseDel;
    const netTotal = lineSum + deliveryForOrder;
    const needsExt =
      netTotal > 0 &&
      (billingSnapshot === null || !Number.isFinite(bal) || bal + 1e-9 < netTotal);

    const lineItemsFull = o.lines.map((c) => ({
      label: c.label,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
    }));
    const MONEY_EPS = 0.005;
    const lineItemsPayload =
      Math.abs(lineSum - netTotal) < MONEY_EPS ? lineItemsFull : undefined;

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
      deliveryForOrder,
      netTotal,
      needsExt,
      receiptLines,
      lineItemsPayload,
    });
    ordersPayload.push({
      totalPrice: netTotal,
      ...(lineItemsPayload ? { lineItems: lineItemsPayload } : {}),
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

