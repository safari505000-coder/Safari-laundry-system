export type PricedCartLine = {
  quantity: number;
  priceNormalKd: string;
  priceExpressKd: string;
};

export function estimateCartTotalKd(
  lines: PricedCartLine[],
  serviceType: 'NORMAL' | 'EXPRESS' = 'NORMAL',
): string {
  const total = lines.reduce((sum, line) => {
    const raw = serviceType === 'EXPRESS' ? line.priceExpressKd : line.priceNormalKd;
    const price = Number.parseFloat(raw);
    return sum + (Number.isFinite(price) ? price : 0) * line.quantity;
  }, 0);

  return total.toFixed(3);
}
