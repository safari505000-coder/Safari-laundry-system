import type { Customer360Financials, Customer360SubscriptionFinancials } from '@/lib/api';
import {
  getArabicInsight,
  getArabicNextAction,
  getArabicStatus,
} from '@/lib/arabic-customer-text';
import { formatKwdLabel } from '@/lib/kwd';

export type Customer360SmartData = {
  name: string;
  rating: 'GOOD' | 'WATCH' | 'BLOCKED';
  financials: Customer360Financials;
  subscription: Customer360SubscriptionFinancials;
  insight: string;
  blockReason?: string | null;
  onCall?: () => void;
  onWhatsapp?: () => void;
  onOverride?: () => void;
};

export default function Customer360Smart({ data }: { data: Customer360SmartData }) {
  const rating = data.rating;
  const fin = data.financials;
  const subscription = data.subscription;
  const hasSubscription = subscription.subscriptionValueKd !== '0.0000';
  const blockReason = data.blockReason ?? fin.blockReason;
  // V23.1 Final — read canonical receivable debt directly. See the
  // long-form rationale on Customer360Financials.canonicalDebtKd in
  // `web/src/lib/api.ts`. Both "unpaid" and "payable now" tiles now
  // render the same canonical number that the Collections cockpit
  // and the Subscribers list use.
  const unpaidInvoicesKd = fin.canonicalDebtKd;
  const payableNowKd = fin.canonicalDebtKd;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div
        className={`rounded-xl p-4 ${
          rating === 'BLOCKED'
            ? 'bg-red-600 text-white'
            : rating === 'WATCH'
              ? 'bg-yellow-400 text-black'
              : 'bg-green-500 text-white'
        }`}
      >
        <h2 className="text-xl font-bold">{getArabicStatus(data.rating)}</h2>
        <div className="mt-2 text-sm">
          المبلغ المطلوب دفعه: {formatKwdLabel(payableNowKd)}
        </div>
        {blockReason && <div className="text-sm">سبب الإيقاف: {blockReason}</div>}
      </div>

      {rating === 'BLOCKED' && (
        <div className="rounded-xl bg-red-500 p-3 text-white">
          🚫 العميل موقوف — لا يمكن إنشاء طلب أو فاتورة
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={data.onCall}>
          📞 اتصال
        </button>
        <button type="button" className="btn" onClick={data.onWhatsapp}>
          💬 واتساب
        </button>

        {rating === 'BLOCKED' && (
          <button
            type="button"
            className="btn bg-black text-white"
            onClick={data.onOverride}
          >
            تجاوز الإيقاف
          </button>
        )}
      </div>

      <div className="rounded border bg-gray-50 p-3 text-gray-950">
        {getArabicInsight(data.financials, data.rating)}
      </div>

      <div className="rounded bg-yellow-100 p-3 text-yellow-950">
        📌 الإجراء المقترح:
        <div className="mt-1">{getArabicNextAction(data.rating)}</div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>🧾 الفواتير غير مدفوعة: {formatKwdLabel(unpaidInvoicesKd)}</div>
        <div>💳 المدفوع: {formatKwdLabel(fin.totalPaymentsKd)}</div>
        <div>📌 المطلوب: {formatKwdLabel(payableNowKd)}</div>
      </div>

      <div className="rounded-xl border p-3">
        <div className="mb-2 font-semibold">📦 الاشتراك</div>
        {hasSubscription ?
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>القيمة: {formatKwdLabel(subscription.subscriptionValueKd)}</div>
            <div>المستهلك: {formatKwdLabel(subscription.subscriptionConsumedKd)}</div>
            <div>
              المتبقي من الاشتراك:{' '}
              {formatKwdLabel(subscription.subscriptionRemainingKd)}
            </div>
          </div>
        : <div className="text-sm text-gray-600">لا يوجد اشتراك</div>}
      </div>
    </div>
  );
}
