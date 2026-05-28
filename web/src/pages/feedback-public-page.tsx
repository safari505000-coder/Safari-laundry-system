import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Star, ShieldCheck, Sparkles, FileText, Send, Check } from 'lucide-react';
import {
  ApiError,
  getPublicOrderForFeedback,
  submitOrderFeedback,
  type PublicFeedbackOrder,
} from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { formatKwdAmount } from '@/lib/kwd';

/**
 * V19.22 — Public customer feedback page.
 *
 * Route: /r/:orderId  (no auth, no shell — standalone public page)
 *
 * UX goal: make a customer who just scanned the invoice QR feel they
 * landed on a branded, trustworthy surface. No ERP chrome. Arabic
 * first, RTL. Large tap targets for mobile (every Safari customer
 * opens this on a phone).
 *
 * Content order (top to bottom):
 *   1. Hero with the Safari gradient + logo + a warm one-line greeting.
 *   2. Invoice summary chip (serial / total / date / driver first name).
 *   3. Rating widget (5 stars) + optional note, then submit.
 *   4. Collapsible terms & conditions card — opened on demand so the
 *      primary CTA (rating) stays above the fold.
 */

const TERMS_AR = [
  'الفاتورة مُسلَّمة بعد الفحص والعد عند الاستلام من السائق.',
  'يُرجى مراجعة الأصناف والكميات المثبتة في الفاتورة فور الاستلام.',
  'الضمان على الغسيل يشمل العيوب الناتجة عن المعالجة فقط، ويجب الإبلاغ عنها خلال 24 ساعة.',
  'الملابس ذات العلامة المائية (Dry Clean Only) تُعالَج حسب إرشادات المصنّع.',
  'الشركة غير مسؤولة عن الأغراض المتروكة داخل الجيوب (نقود، مفاتيح، مجوهرات).',
  'الدفع الآجل (على الحساب) يخضع لحدود العميل الائتمانية، وتُحسب المديونية على المحفظة.',
  'تُرسَل روابط الدفع برسائل رسمية من Safari فقط — لا تتعامل مع أي رابط من مصدر آخر.',
];

export function FeedbackPublicPage() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<PublicFeedbackOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    getPublicOrderForFeedback(orderId)
      .then((o) => {
        setOrder(o);
        if (o.alreadyRated) {
          setRating(o.alreadyRated.rating);
          setNote(o.alreadyRated.note ?? '');
          setSubmitted(true);
        }
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) {
          setLoadError('الفاتورة غير موجودة أو انتهت صلاحية الرابط.');
        } else {
          setLoadError(
            e instanceof ApiError ? e.message : 'تعذّر تحميل بيانات الفاتورة.',
          );
        }
      });
  }, [orderId]);

  const prettyTotal = useMemo(() => {
    if (!order) return '-';
    return formatKwdAmount(order.totalKd);
  }, [order]);

  const prettyDate = useMemo(() => {
    if (!order) return '-';
    try {
      return new Date(order.createdAt).toLocaleString('ar-KW', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return order.createdAt;
    }
  }, [order]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || rating < 1) {
      setSubmitError('يُرجى اختيار تقييم من 1 إلى 5 نجوم.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitOrderFeedback(orderId, {
        rating,
        note: note.trim() || undefined,
      });
      setSubmitted(true);
    } catch (e) {
      setSubmitError(
        e instanceof ApiError ? e.message : 'تعذّر إرسال التقييم. حاول مرة أخرى.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-6 font-[Cairo,Almarai,system-ui,sans-serif] text-slate-900"
    >
      <div className="mx-auto max-w-xl space-y-5">
        {/* ─── Hero ─────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 p-6 text-white shadow-lg">
          <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <img
              src={BRAND.brandMarkPath}
              alt={BRAND.customerAr}
              className="h-14 w-14 rounded-2xl bg-white/90 object-contain p-1.5 shadow-md"
            />
            <div>
              <h1 className="text-lg font-bold leading-tight">
                {BRAND.customerAr}
              </h1>
              <p className="text-xs opacity-90">{BRAND.customerEn}</p>
            </div>
          </div>
          <p className="relative mt-1 text-xs font-medium text-white/85">
            صفحة بسيطة وآمنة — التقييم يصل لفريقنا مباشرة
          </p>
          <p className="relative mt-4 text-sm leading-relaxed opacity-95">
            {order?.customerFirstName ? `أهلاً ${order.customerFirstName}! ` : 'شكراً لاختيارك Safari! '}
            رأيك يساعدنا نخدمك أفضل في المرة القادمة.
          </p>
        </div>

        {/* ─── Invoice summary ─────────────────────────────────────── */}
        {loadError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-800 shadow-sm">
            {loadError}
          </div>
        ) : !order ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500 shadow-sm">
            جارٍ التحميل…
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-3">
              <span className="text-xs font-medium text-slate-500">رقم الفاتورة</span>
              <span className="font-mono text-sm font-bold text-slate-800">
                {order.serialNumber || order.invoiceNumber || order.orderId.slice(0, 8)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[11px] text-slate-500">الإجمالي</div>
                <div className="font-bold text-emerald-700" dir="ltr">
                  {prettyTotal} KWD
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">التاريخ</div>
                <div className="text-slate-800">{prettyDate}</div>
              </div>
              {order.driverFirstName ? (
                <div className="col-span-2">
                  <div className="text-[11px] text-slate-500">قام بالخدمة</div>
                  <div className="font-medium text-slate-800">
                    {order.driverFirstName}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ─── Rating card ─────────────────────────────────────────── */}
        {order && !loadError ? (
          submitted ? (
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
                <Check className="h-7 w-7" strokeWidth={3} />
              </div>
              <h2 className="mt-4 text-lg font-bold text-emerald-900">
                شكراً لتقييمك!
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                وصلنا رأيك — فريقنا سيطّلع عليه ويرجع لك لو كان فيه أي ملاحظة.
              </p>
              <div className="mt-4 flex justify-center gap-1">
                {Array.from({ length: 5 }, (_, i) => i + 1).map((i) => (
                  <Star
                    key={`star-display-${i}`}
                    className={`h-6 w-6 ${
                      i <= rating
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-300'
                    }`}
                  />
                ))}
              </div>
              {note ? (
                <p className="mx-auto mt-3 max-w-sm rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  “{note}”
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                }}
                className="mt-4 text-xs font-medium text-emerald-700 underline-offset-4 hover:underline"
              >
                تعديل التقييم
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Sparkles className="h-4 w-4 text-amber-500" />
                كيف كانت تجربتك؟
              </div>
              <div className="mt-4 flex justify-center gap-1">
                {Array.from({ length: 5 }, (_, i) => i + 1).map((i) => {
                  const active = (hoverRating || rating) >= i;
                  return (
                    <button
                      key={`star-btn-${i}`}
                      type="button"
                      onMouseEnter={() => setHoverRating(i)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(i)}
                      className="p-1 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 rounded-lg"
                      aria-label={`${i} نجوم`}
                    >
                      <Star
                        className={`h-10 w-10 transition-colors ${
                          active ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                        strokeWidth={1.6}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-center text-xs text-slate-500">
                {rating === 0
                  ? 'اضغط على النجوم لاختيار التقييم'
                  : RATING_LABELS_AR[rating - 1]}
              </div>

              <label className="mt-5 block text-xs font-medium text-slate-600">
                ملاحظة (اختياري)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="شاركنا أي ملاحظة — مدح أو اقتراح للتحسين…"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
              <div className="mt-1 text-end text-[11px] text-slate-400">
                {note.length}/1000
              </div>

              {submitError ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                  {submitError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting || rating < 1}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:from-emerald-700 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'جارٍ الإرسال…' : 'إرسال التقييم'}
              </button>
            </form>
          )
        ) : null}

        {/* ─── Terms & Conditions ──────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setTermsOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-5 py-4 text-start"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <FileText className="h-4 w-4 text-slate-500" />
              الشروط والأحكام
            </span>
            <span className="text-xs text-slate-400">
              {termsOpen ? 'إخفاء' : 'عرض'}
            </span>
          </button>
          {termsOpen ? (
            <div className="border-t border-slate-100 px-5 py-4">
              <ol className="list-decimal space-y-2 pe-5 text-[13px] leading-relaxed text-slate-700">
                {TERMS_AR.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>

        {/* ─── Trust footer ────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-2 pt-2 text-[11px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>صفحة آمنة — بياناتك محفوظة في {BRAND.customerAr}</span>
        </div>
      </div>
    </div>
  );
}

const RATING_LABELS_AR = [
  'غير راضٍ',
  'ضعيف',
  'مقبول',
  'جيد',
  'ممتاز',
];
