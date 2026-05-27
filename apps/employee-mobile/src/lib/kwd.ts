export function formatKwdLabel(amountKd: string): string {
  const trimmed = amountKd.trim();
  if (!trimmed) {
    return '0.000 د.ك';
  }
  return `${trimmed} د.ك`;
}
