export type CustomerRating = 'GOOD' | 'WATCH' | 'BLOCKED';
export type CustomerHealth = 'GOOD' | 'WATCH' | 'RISK' | 'BLOCKED';

export type CustomerEvaluationFinancials = {
  consumedKd: string | number;
  subscriptionValueKd: string | number;
  subscriptionConsumedKd?: string | number;
  totalDueKd: string | number;
  isBlocked?: boolean;
};

export function evaluateCustomer(fin: CustomerEvaluationFinancials): CustomerRating {
  const debt = toNumber(fin.totalDueKd);
  const consumed = toNumber(fin.subscriptionConsumedKd ?? fin.consumedKd);
  const totalValue = toNumber(fin.subscriptionValueKd);
  const overuse = consumed - totalValue;

  if (fin.isBlocked) return 'BLOCKED';
  if (debt > 500 || overuse > 200) return 'BLOCKED';
  if (debt > 50 || overuse > 20) return 'WATCH';
  return 'GOOD';
}

export function buildInsight(
  fin: CustomerEvaluationFinancials,
  rating: CustomerRating,
): string {
  void fin;
  if (rating === 'BLOCKED') {
    return '🚫 العميل موقوف بسبب دين عالي أو تجاوز الباقة';
  }
  if (rating === 'WATCH') {
    return '⚠️ العميل يحتاج متابعة بسبب تأخر أو استهلاك عالي';
  }
  return '✅ العميل ملتزم';
}

export type CustomerIntelligenceInput = CustomerEvaluationFinancials & {
  paymentConsistency?: number;
  avgPaymentDelayHours?: number;
  lifetimeValueKd?: string | number;
};

export type CustomerIntelligence = {
  customerHealth: CustomerHealth;
  paymentConsistency: number;
  avgPaymentDelayHours: number;
  lifetimeValueKd: string;
};

export function evaluateCustomerIntelligence(
  input: CustomerIntelligenceInput,
): CustomerIntelligence {
  const rating = evaluateCustomer(input);
  const paymentConsistency = clampRatio(input.paymentConsistency ?? 0);
  const avgPaymentDelayHours = Math.max(toNumber(input.avgPaymentDelayHours ?? 0), 0);
  const lifetimeValue = toNumber(input.lifetimeValueKd ?? 0);

  let customerHealth: CustomerHealth =
    rating === 'BLOCKED' ? 'BLOCKED'
    : rating === 'WATCH' ? 'WATCH'
    : 'GOOD';

  if (
    customerHealth !== 'BLOCKED' &&
    (paymentConsistency < 0.6 || avgPaymentDelayHours > 72)
  ) {
    customerHealth = 'RISK';
  }

  return {
    customerHealth,
    paymentConsistency,
    avgPaymentDelayHours: Math.round(avgPaymentDelayHours * 100) / 100,
    lifetimeValueKd: lifetimeValue.toFixed(4),
  };
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function toNumber(value: string | number): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}
