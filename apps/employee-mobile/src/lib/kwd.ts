export function formatKwdLabel(amountKd: string): string {
  const amount = Number.parseFloat(amountKd.trim());
  if (!Number.isFinite(amount)) {
    return '0.000 د.ك';
  }
  return `${amount.toLocaleString('en-GB', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: false,
  })} د.ك`;
}
