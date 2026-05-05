import type { Customer360Financials, Customer360SubscriptionFinancials } from '@/lib/api';
import {
  formatArabicKwd,
  getArabicInsight,
  getArabicNextAction,
  getArabicStatus,
} from '@/lib/arabic-customer-text';

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
  const hasSubscription = Number.parseFloat(subscription.subscriptionValueKd) > 0;
  const blockReason = data.blockReason ?? fin.blockReason;

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
          المبلغ المطلوب دفعه: {formatArabicKwd(fin.totalDueKd)} د.ك
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
        <div>🧾 الفواتير: {formatArabicKwd(fin.totalInvoicesKd)} د.ك</div>
        <div>💳 المدفوع: {formatArabicKwd(fin.totalPaymentsKd)} د.ك</div>
        <div>📌 المطلوب: {formatArabicKwd(fin.totalDueKd)} د.ك</div>
      </div>

      <div className="rounded-xl border p-3">
        <div className="mb-2 font-semibold">📦 الاشتراك</div>
        {hasSubscription ?
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>القيمة: {formatArabicKwd(subscription.subscriptionValueKd)} د.ك</div>
            <div>المستهلك: {formatArabicKwd(subscription.subscriptionConsumedKd)} د.ك</div>
            <div>
              المتبقي من الاشتراك:{' '}
              {formatArabicKwd(subscription.subscriptionRemainingKd)} د.ك
            </div>
          </div>
        : <div className="text-sm text-gray-600">لا يوجد اشتراك</div>}
      </div>
    </div>
  );
}
