import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import {
  ApiError,
  getPublicPaymentStatus,
  recheckPublicPayment,
  type PublicPaymentRecheck,
  type PublicPaymentStatus,
} from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { formatKwdLabel } from '@/lib/kwd';
import { Button } from '@/modules/shared/components/ui/button';

/**
 * After UPayments redirect, the order id may appear as:
 *   - `orderId` (our legacy returnUrl) — value can be corrupt if a second
 *     `?` was injected (`uuid?payment_id=…`); we strip at first `?`.
 *   - `requested_order_id` (UPayments) — matches our Safari `Order.id`.
 *   - `trn_udf=orderId=<uuid>` (echo of customerExtraData).
 */
function resolveOrderIdFromUrl(params: URLSearchParams): string {
  const raw = params.get('orderId')?.trim();
  if (raw) {
    const uuid = raw.split('?')[0]?.trim() ?? '';
    if (uuid) return uuid;
  }
  const req = params.get('requested_order_id')?.trim();
  if (req) return req;
  const udf = params.get('trn_udf')?.trim();
  if (udf) {
    const m = udf.match(/orderId=([0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12})/i);
    if (m) return m[1];
  }
  return '';
}

/** v2 UPayments `track_id` (return page) — not the same as `session_id` in the hosted link. */
function resolveReturnGatewayTrackId(params: URLSearchParams): string {
  return (
    params.get('track_id')?.trim() ||
    params.get('TrackID')?.trim() ||
    params.get('trackId')?.trim() ||
    ''
  );
}

/**
 * V1.7.0 — Customer-facing landing page after UPayments redirects
 * the shopper back from the hosted checkout. Rendered at two
 * routes:
 *   - `/payment/success?…` (returnUrl; order id in query — see resolve helper)
 *   - `/payment/failed?…`  (cancelUrl)
 *
 * UX rules:
 *   - Public route — no login. The URL alone is enough; the
 *     backend only exposes status + amount for the given orderId,
 *     nothing sensitive.
 *   - Kept **polling** the public status endpoint every 3 seconds
 *     for up to ~90 seconds because the UPayments webhook races
 *     the browser redirect: the customer often lands here BEFORE
 *     the notification POST has finalized the order on our side.
 *     The page flips from "جاري التحقق" to "تم الدفع" automatically
 *     when the backend catches up. No manual refresh needed.
 *   - If the initial `mode` is `failed` we show the red state and
 *     a "Retry payment" CTA that navigates back to the order's
 *     payment link (or Collections page if the link has expired).
 */
export function PaymentResultPage({
  mode,
}: {
  mode: 'success' | 'failed';
}) {
  const [searchParams] = useSearchParams();
  const orderId = resolveOrderIdFromUrl(searchParams);
  const returnGatewayTrackId = resolveReturnGatewayTrackId(searchParams);

  const [status, setStatus] = useState<PublicPaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [recheckBusy, setRecheckBusy] = useState(false);
  const [recheckResult, setRecheckResult] = useState<PublicPaymentRecheck | null>(null);
  const stoppedRef = useRef(false);

  const handleManualRecheck = useCallback(async () => {
    if (!orderId || recheckBusy) return;
    setError(null);
    setRecheckBusy(true);
    try {
      const r = await recheckPublicPayment(orderId, {
        returnTrackId: returnGatewayTrackId || undefined,
      });
      setRecheckResult(r);
      setStatus({
        orderId: r.orderId,
        status: r.status,
        isPaid: r.isPaid,
        amountKd: r.amountKd,
      });
      if (r.isPaid) {
        stoppedRef.current = true;
      }
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'تعذّر الاتصال بالخادم. حاول مرة أخرى بعد لحظات.',
      );
    } finally {
      setRecheckBusy(false);
    }
  }, [orderId, recheckBusy, returnGatewayTrackId]);

  useEffect(() => {
    if (!orderId) {
      setError('معرّف الطلب غير موجود في الرابط.');
      return;
    }

    stoppedRef.current = false;
    let cancelled = false;
    let attempt = 0;

    const tick = async () => {
      if (cancelled || stoppedRef.current) return;
      try {
        const s = await getPublicPaymentStatus(orderId, {
          returnTrackId: returnGatewayTrackId || undefined,
        });
        if (cancelled) return;
        setStatus(s);
        if (s.isPaid) {
          stoppedRef.current = true;
          return;
        }
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof ApiError
            ? e.message
            : 'تعذّر الاتصال بالخادم. جرّب تحديث الصفحة.',
        );
      }
      attempt += 1;
      setSecondsElapsed(attempt * 3);
      // Stop polling after ~90s — if nothing has landed by then,
      // the gateway most likely won't send a webhook at all (
      // cancelled / expired session).
      if (attempt >= 30) {
        stoppedRef.current = true;
        return;
      }
      setTimeout(tick, 3000);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [orderId, returnGatewayTrackId]);

  const resolvedMode: 'success' | 'failed' | 'pending' = useMemo(() => {
    if (status?.isPaid) return 'success';
    if (mode === 'failed' && status && !status.isPaid) return 'failed';
    if (mode === 'success' && status && !status.isPaid) return 'pending';
    return mode;
  }, [mode, status]);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-slate-900 to-slate-700 text-white px-6 py-5 text-center">
          <h1 className="text-lg font-semibold tracking-tight">
            {BRAND.customerAr}
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            بوّابة الدفع الإلكتروني
          </p>
        </div>

        <div className="px-6 py-8 text-center">
          {resolvedMode === 'success' ? (
            <SuccessBlock status={status} />
          ) : resolvedMode === 'failed' ? (
            <FailedBlock
              status={status}
              onRecheck={handleManualRecheck}
              recheckBusy={recheckBusy}
              hasOrderId={Boolean(orderId)}
            />
          ) : (
            <PendingBlock
              status={status}
              secondsElapsed={secondsElapsed}
              onRecheck={handleManualRecheck}
              recheckBusy={recheckBusy}
              hasOrderId={Boolean(orderId)}
            />
          )}

          {recheckResult && !recheckResult.isPaid && (
            <p className="mt-4 text-sm text-amber-700 bg-amber-50 rounded-md p-3 border border-amber-200 leading-6">
              {recheckResult.messageAr}
            </p>
          )}
          {recheckResult?.isPaid && recheckResult.settledNow && (
            <p className="mt-4 text-sm text-emerald-700 bg-emerald-50 rounded-md p-3 border border-emerald-200 leading-6">
              {recheckResult.messageAr}
            </p>
          )}

          {error && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-md p-3 border border-red-200">
              {error}
            </p>
          )}

          {orderId && (
            <div className="mt-6 text-[11px] text-slate-400 font-mono break-all">
              Ref: {orderId.slice(0, 8)}…{orderId.slice(-4)}
            </div>
          )}
        </div>

        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 text-center text-xs text-slate-500">
          للاستفسار: <strong className="text-slate-700">22200299</strong>
        </div>
      </div>
    </div>
  );
}

function SuccessBlock({ status }: { status: PublicPaymentStatus | null }) {
  return (
    <>
      <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-600" strokeWidth={2} />
      </div>
      <h2 className="mt-4 text-xl font-bold text-slate-900">
        تم الدفع بنجاح
      </h2>
      <p className="mt-2 text-slate-600 leading-7">
        شكراً لك. وصلنا إشعار الدفع وتم تأكيد طلبك.
      </p>
      {status && (
        <p className="mt-4 text-2xl font-bold text-slate-900 tabular-nums">
          {formatKwdLabel(status.amountKd)}
        </p>
      )}
      <p className="mt-6 text-xs text-slate-400">
        يمكنك إغلاق هذه الصفحة الآن.
      </p>
    </>
  );
}

function FailedBlock({
  status,
  onRecheck,
  recheckBusy,
  hasOrderId,
}: {
  status: PublicPaymentStatus | null;
  onRecheck: () => void;
  recheckBusy: boolean;
  hasOrderId: boolean;
}) {
  return (
    <>
      <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
        <XCircle className="w-10 h-10 text-red-600" strokeWidth={2} />
      </div>
      <h2 className="mt-4 text-xl font-bold text-slate-900">
        لم يكتمل الدفع
      </h2>
      <p className="mt-2 text-slate-600 leading-7">
        تم إلغاء عملية الدفع أو انتهت المهلة قبل تأكيدها من البنك.
      </p>
      {status && (
        <p className="mt-4 text-xl font-semibold text-slate-900 tabular-nums">
          المبلغ المطلوب: {formatKwdLabel(status.amountKd)}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2">
        <Button
          type="button"
          onClick={onRecheck}
          disabled={!hasOrderId || recheckBusy}
          className="bg-emerald-700 hover:bg-emerald-800 text-white"
        >
          <ShieldCheck className="w-4 h-4 ms-2" />
          {recheckBusy ? 'جارٍ التحقق…' : 'إعادة التحقق من الدفع'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => window.location.reload()}
          className="border-slate-300 text-slate-700"
        >
          <RefreshCw className="w-4 h-4 ms-2" />
          تحديث حالة الطلب
        </Button>
        <p className="text-xs text-slate-500 mt-2">
          إن كنت أتممت الدفع من البنك ولم يتغيّر الحال، اضغط «إعادة التحقق من الدفع». إن استمرت المشكلة تواصل مع مركز الخدمة.
        </p>
      </div>
    </>
  );
}

function PendingBlock({
  status,
  secondsElapsed,
  onRecheck,
  recheckBusy,
  hasOrderId,
}: {
  status: PublicPaymentStatus | null;
  secondsElapsed: number;
  onRecheck: () => void;
  recheckBusy: boolean;
  hasOrderId: boolean;
}) {
  return (
    <>
      <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
        <Clock className="w-10 h-10 text-amber-600 animate-pulse" strokeWidth={2} />
      </div>
      <h2 className="mt-4 text-xl font-bold text-slate-900">
        جاري التحقق من الدفع…
      </h2>
      <p className="mt-2 text-slate-600 leading-7">
        استلمنا عودتك من بوّابة الدفع. نقوم بالتحقق من تأكيد البنك
        تلقائياً، قد يستغرق الأمر بضع ثوانٍ.
      </p>
      {status && (
        <p className="mt-4 text-lg font-semibold text-slate-800 tabular-nums">
          {formatKwdLabel(status.amountKd)}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-400 tabular-nums">
        جاري الفحص… ({secondsElapsed}s)
      </p>
      <div className="mt-5">
        <Button
          type="button"
          onClick={onRecheck}
          disabled={!hasOrderId || recheckBusy}
          className="bg-emerald-700 hover:bg-emerald-800 text-white"
        >
          <ShieldCheck className="w-4 h-4 ms-2" />
          {recheckBusy ? 'جارٍ التحقق…' : 'إعادة التحقق من الدفع'}
        </Button>
        <p className="mt-2 text-[11px] text-slate-500 leading-5">
          اضغط إعادة التحقق لاستعلام فوري من بوابة الدفع دون انتظار الإشعار التلقائي.
        </p>
      </div>
    </>
  );
}

export function PaymentSuccessPage() {
  return <PaymentResultPage mode="success" />;
}

export function PaymentFailedPage() {
  return <PaymentResultPage mode="failed" />;
}

export default PaymentResultPage;
