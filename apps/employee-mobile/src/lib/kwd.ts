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

function toFils(amountKd: string): bigint {
  const normalized = amountKd.trim().replace(',', '.');
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    return 0n;
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = (match[3] ?? '').padEnd(3, '0').slice(0, 3);
  return sign * (whole * 1000n + BigInt(fraction));
}

export function sumKwdStrings(amounts: readonly string[]): string {
  const totalFils = amounts.reduce((sum, amount) => sum + toFils(amount), 0n);
  const sign = totalFils < 0n ? '-' : '';
  const abs = totalFils < 0n ? -totalFils : totalFils;
  const whole = abs / 1000n;
  const fraction = (abs % 1000n).toString().padStart(3, '0');
  return `${sign}${whole.toString()}.${fraction}`;
}
