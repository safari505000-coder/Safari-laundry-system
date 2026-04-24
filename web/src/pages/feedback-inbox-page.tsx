import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, MessageSquareQuote, RefreshCw, Star } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  acknowledgeFeedback,
  listFeedback,
  type FeedbackListResponse,
  type FeedbackListRow,
} from '@/lib/api';

/**
 * V19.22 — Customer Ratings inbox for Owner / GM / Call-Center.
 *
 * Shows:
 *   • Summary strip: avg rating, rated count, unread count.
 *   • Filter: unread only, rating buckets (👍 4-5 / 😐 3 / 👎 1-2).
 *   • List: rating + note + invoice ref + customer phone +
 *           "تم الاطلاع" button (acknowledge).
 *
 * Access is gated by the `'feedback.view'` capability so adding the
 * role to the allow-list in `access-matrix.ts` automatically opens
 * this page + the sidebar entry.
 */
export function FeedbackInboxPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [data, setData] = useState<FeedbackListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAckId, setBusyAckId] = useState<string | null>(null);

  const [onlyUnread, setOnlyUnread] = useState(false);
  const [bucket, setBucket] = useState<'ALL' | 'LOW' | 'MID' | 'HIGH'>('ALL');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const bucketMap: Record<typeof bucket, { minRating?: number; maxRating?: number }> = {
        ALL: {},
        LOW: { minRating: 1, maxRating: 2 },
        MID: { minRating: 3, maxRating: 3 },
        HIGH: { minRating: 4, maxRating: 5 },
      };
      const filt = bucketMap[bucket];
      const res = await listFeedback(token, {
        onlyUnread,
        minRating: filt.minRating,
        maxRating: filt.maxRating,
        take: 100,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر تحميل التقييمات.');
    } finally {
      setLoading(false);
    }
  }, [token, onlyUnread, bucket]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAcknowledge = async (row: FeedbackListRow) => {
    if (!token || row.acknowledgedAt) return;
    setBusyAckId(row.id);
    try {
      await acknowledgeFeedback(row.id, token);
      setData((prev) =>
        prev
          ? {
              ...prev,
              unread: Math.max(prev.unread - 1, 0),
              rows: prev.rows.map((r) =>
                r.id === row.id
                  ? { ...r, acknowledgedAt: new Date().toISOString() }
                  : r,
              ),
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر الاطلاع على التقييم.');
    } finally {
      setBusyAckId(null);
    }
  };

  const avg = data?.avgRating ?? 0;

  const summary = useMemo(
    () => [
      {
        label: 'متوسط التقييم',
        value: avg ? avg.toFixed(2) : '—',
        sub: `من ${data?.ratedCount ?? 0} تقييم`,
        color: avg >= 4 ? 'text-emerald-600' : avg >= 3 ? 'text-amber-600' : 'text-red-600',
      },
      {
        label: 'لم يُطَّلع عليها',
        value: String(data?.unread ?? 0),
        sub: 'تحتاج متابعة',
        color: (data?.unread ?? 0) > 0 ? 'text-red-600' : 'text-slate-500',
      },
      {
        label: 'إجمالي الواصل',
        value: String(data?.total ?? 0),
        sub: 'في هذه الفلترة',
        color: 'text-slate-800',
      },
    ],
    [avg, data],
  );

  return (
    <div dir="rtl" className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <MessageSquareQuote className="h-5 w-5 text-emerald-600" />
            {t('feedbackInbox.title')}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
            {t('feedbackInbox.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('feedbackInbox.refresh')}
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {summary.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="text-[11px] text-slate-500">{s.label}</div>
            <div className={`mt-0.5 text-2xl font-bold tabular-nums ${s.color}`}>
              {s.value}
            </div>
            <div className="text-[10px] text-slate-400">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          غير مُطَّلع عليها فقط
        </label>
        <div className="ms-auto flex gap-1">
          {(['ALL', 'LOW', 'MID', 'HIGH'] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                bucket === b
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {BUCKET_LABELS[b]}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {/* List */}
      <div className="space-y-3">
        {loading && !data ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            جارٍ التحميل…
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            لا توجد تقييمات ضمن هذه الفلترة.
          </div>
        ) : (
          data.rows.map((row) => (
            <FeedbackCard
              key={row.id}
              row={row}
              onAcknowledge={() => void handleAcknowledge(row)}
              busy={busyAckId === row.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FeedbackCard({
  row,
  onAcknowledge,
  busy,
}: {
  row: FeedbackListRow;
  onAcknowledge: () => void;
  busy: boolean;
}) {
  const isLow = row.rating <= 2;
  const isHigh = row.rating >= 4;
  const unread = !row.acknowledgedAt;

  const submittedLabel = useMemo(() => {
    try {
      return new Date(row.submittedAt).toLocaleString('ar-KW', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return row.submittedAt;
    }
  }, [row.submittedAt]);

  const totalLabel = useMemo(() => {
    const n = Number.parseFloat(row.order.totalKd);
    return Number.isFinite(n) ? n.toFixed(3) : row.order.totalKd;
  }, [row.order.totalKd]);

  const ringColor = isLow
    ? 'border-red-200 bg-red-50/40'
    : isHigh
      ? 'border-emerald-200 bg-emerald-50/40'
      : 'border-amber-200 bg-amber-50/40';

  return (
    <div
      className={`relative rounded-xl border ${ringColor} p-4 shadow-sm ${
        unread ? 'ring-2 ring-offset-1 ring-amber-200' : ''
      }`}
    >
      {unread ? (
        <span className="absolute end-3 top-3 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
          جديد
        </span>
      ) : null}
      <div className="flex items-start gap-3">
        {/* Rating stars */}
        <div className="flex min-w-[104px] flex-col items-center rounded-xl bg-white p-2 shadow-sm">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }, (_, i) => i + 1).map((i) => (
              <Star
                key={i}
                className={`h-4 w-4 ${
                  i <= row.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                }`}
              />
            ))}
          </div>
          <div className="mt-1 text-xs font-bold text-slate-800 tabular-nums">
            {row.rating}/5
          </div>
          <div className="text-[10px] text-slate-400">{submittedLabel}</div>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-mono font-bold text-slate-800">
              {row.order.serialNumber || row.order.invoiceNumber || row.order.id.slice(0, 8)}
            </span>
            <span className="text-slate-400">·</span>
            <span className="tabular-nums text-slate-700" dir="ltr">
              {totalLabel} KWD
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">
              {row.order.customer.displayName ?? '—'} ({row.order.customer.phone})
            </span>
            {row.order.driver ? (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">السائق: {row.order.driver.fullName}</span>
              </>
            ) : null}
          </div>
          {row.note ? (
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-2.5 text-[13px] leading-relaxed text-slate-800 shadow-inner">
              “{row.note}”
            </p>
          ) : (
            <p className="mt-2 text-xs italic text-slate-400">— بدون ملاحظة —</p>
          )}
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {row.ipMasked ? `IP: ${row.ipMasked}` : ''}
            </span>
            {row.acknowledgedAt ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <Check className="h-3 w-3" /> تم الاطلاع
              </span>
            ) : (
              <button
                type="button"
                onClick={onAcknowledge}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Check className="h-3 w-3" />
                {busy ? 'جارٍ…' : 'تم الاطلاع'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const BUCKET_LABELS: Record<'ALL' | 'LOW' | 'MID' | 'HIGH', string> = {
  ALL: 'الكل',
  LOW: '1-2 ★',
  MID: '3 ★',
  HIGH: '4-5 ★',
};
