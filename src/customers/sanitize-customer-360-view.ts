import type {
  Customer360InternalDto,
  Customer360SanitizedDto,
  Customer360StatementDto,
} from './customer-360.types';

const NUMERIC_STRING = /^\d+\.\d+$/;

export function applyCustomerFriendlyPhrases(text: string): string {
  return text
    .replace(/\bdebt\b/gi, 'المبلغ المستحق')
    .replace(/\boveruse\b/gi, 'تجاوز الباقة');
}

function deepSanitizeCopy(input: unknown): unknown {
  if (typeof input === 'string') {
    if (NUMERIC_STRING.test(input.trim())) {
      return input;
    }
    return applyCustomerFriendlyPhrases(input);
  }
  if (input === null || typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((x) => deepSanitizeCopy(x));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = deepSanitizeCopy(v);
  }
  return out;
}

export function buildCustomerFriendlySummary(statement: Customer360StatementDto): string {
  const f = statement.financials;
  const subscriptionValue = Number.parseFloat(f.subscriptionValueKd);
  const subscriptionText =
    Number.isFinite(subscriptionValue) && subscriptionValue > 0 ?
      `قيمة الاشتراك ${f.subscriptionValueKd} د.ك، والمستهلك ${f.subscriptionConsumedKd} د.ك، ` +
      `والمتبقي من الاشتراك ${f.subscriptionRemainingKd} د.ك.`
    : 'لا يوجد اشتراك.';
  return (
    `إجمالي الفواتير ${f.totalInvoicesKd} د.ك، والمدفوع ${f.totalPaymentsKd} د.ك. ` +
    `المبلغ المطلوب دفعه حالياً ${f.totalDueKd} د.ك. ` +
    subscriptionText
  );
}

/**
 * Presentation-only layer: same numeric financials after deep copy + phrase pass;
 * removes internal-only fields and adds friendlySummary.
 */
export function sanitizeCustomerView(data: Customer360InternalDto): Customer360SanitizedDto {
  const statement = deepSanitizeCopy(data.statement) as Customer360StatementDto;
  const subscriptions = deepSanitizeCopy(data.subscriptions) as Customer360InternalDto['subscriptions'];
  const subscription = deepSanitizeCopy(data.subscription) as Customer360InternalDto['subscription'];
  const customer = deepSanitizeCopy(data.customer) as Customer360InternalDto['customer'];

  return {
    customer,
    subscriptions,
    subscription,
    statement,
    rating: data.rating,
    insight: applyCustomerFriendlyPhrases(data.insight),
    score: null,
    insights: null,
    friendlySummary: buildCustomerFriendlySummary(statement),
  };
}
