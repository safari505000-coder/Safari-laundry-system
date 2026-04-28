import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import { Clock, Download, Home, RefreshCw, ShieldCheck, Share2, XCircle } from 'lucide-react';
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
 * V1.7.1 — Customer-facing landing page after UPayments redirects the
 * shopper back from the hosted checkout. Rendered at two routes:
 *   • `/payment/success?…` (returnUrl; order id in query — see resolve helper)
 *   • `/payment/failed?…`  (cancelUrl)
 *
 * Owner directive (V1.7.1): this is a **luxury digital receipt** —
 *   1. Never expose the raw UUID; only the short POS serial (e.g. A-47).
 *   2. Royal-navy / soft-gold palette with glassmorphism.
 *   3. Animated success checkmark + one-shot confetti.
 *   4. Premium success jingle synthesized via Web Audio API (zero asset
 *      weight; autoplay gracefully degrades when the browser blocks it).
 *   5. Action buttons: Download PDF · Share via WhatsApp · Return home.
 *
 * UX rules (unchanged from V1.7.0):
 *   - Public route — no login. The URL alone is enough; the backend only
 *     exposes status + amount for the given orderId, nothing sensitive.
 *   - Keeps polling the public status endpoint every 3s for ~90s because
 *     the UPayments webhook races the browser redirect.
 *   - If the initial `mode` is `failed` we show the red state and a
 *     "Retry payment" CTA.
 */

/** Our Prisma `Order.id` (UUID v4-style). UPayments `order_id` is often a different hex id. */
const SAFARI_ORDER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Some gateways / emails emit `&amp;` instead of `&`; `URLSearchParams` then
 * misses every param after the first. Normalize before parsing.
 */
function normalizeQuerySearchStringForParsing(q: string): string {
  return q.replace(/&amp;/gi, '&').replace(/%26amp%3B/gi, '&');
}

/**
 * After UPayments redirect, the Safari order id may appear as:
 *   - `requested_order_id` (UPayments) — best; matches our `Order.id`.
 *   - `trn_udf=orderId=<uuid>` (echo of customerExtraData).
 *   - `orderId` or `order_id` — only if the value is a real UUID.
 */
function resolveOrderIdFromPaymentReturnUrl(search: string): string {
  const raw = (search ?? '').replace(/^\?/, '');
  const normalized = normalizeQuerySearchStringForParsing(raw);
  const params = new URLSearchParams(normalized);

  const requested = params.get('requested_order_id')?.trim();
  if (requested && SAFARI_ORDER_UUID_RE.test(requested)) {
    return requested;
  }

  const udf = params.get('trn_udf')?.trim();
  if (udf) {
    const m = udf.match(
      /orderId=([0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12})/i,
    );
    if (m?.[1] && SAFARI_ORDER_UUID_RE.test(m[1])) {
      return m[1];
    }
  }

  for (const key of ['orderId', 'order_id'] as const) {
    const v = params.get(key)?.trim();
    if (v && SAFARI_ORDER_UUID_RE.test(v.split('?')[0] ?? '')) {
      return (v.split('?')[0] ?? v).trim();
    }
  }

  const blob = `?${normalized}`;
  const fallbackReq =
    /[?&]requested_order_id=([0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12})/i.exec(
      blob,
    );
  if (fallbackReq?.[1]) {
    return fallbackReq[1];
  }

  const udfQ = /[?&]trn_udf=([^&]+)/i.exec(blob);
  if (udfQ?.[1]) {
    let inner = udfQ[1];
    try {
      inner = decodeURIComponent(inner.replace(/\+/g, ' '));
    } catch {
      /* keep raw */
    }
    const m2 = inner.match(
      /orderId=([0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12})/i,
    );
    if (m2?.[1]) {
      return m2[1];
    }
  }

  return '';
}

/** v2 UPayments `track_id` (return page) — not the same as `session_id` in the hosted link. */
function resolveReturnGatewayTrackIdFromSearch(search: string): string {
  const raw = (search ?? '').replace(/^\?/, '');
  const normalized = normalizeQuerySearchStringForParsing(raw);
  const params = new URLSearchParams(normalized);
  const fromParams =
    params.get('track_id')?.trim() ||
    params.get('TrackID')?.trim() ||
    params.get('trackId')?.trim() ||
    '';
  if (fromParams) {
    return fromParams;
  }
  const blob = `?${normalized}`;
  const m = /[?&]track_id=([^&]+)/i.exec(blob);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1].trim());
    } catch {
      return m[1].trim();
    }
  }
  return '';
}

/** Gateway `result=` on the return URL (e.g. CAPTURED). */
function resolveGatewayReturnResultFromSearch(search: string): string {
  const raw = (search ?? '').replace(/^\?/, '');
  const normalized = normalizeQuerySearchStringForParsing(raw);
  const params = new URLSearchParams(normalized);
  const fromParams =
    params.get('result')?.trim() || params.get('Result')?.trim() || '';
  if (fromParams) {
    return fromParams;
  }
  const blob = `?${normalized}`;
  const m = /[?&]result=([^&]+)/i.exec(blob);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1].trim());
    } catch {
      return m[1].trim();
    }
  }
  return '';
}

/**
 * V1.7.1 — Synthesize a soft premium "success jingle" via Web Audio API.
 * Three notes (C5 → E5 → G5) with an exponential attack/decay envelope
 * layered over a gentle sine — emulates a muted register ding.
 * Completely silent fallback when AudioContext is unavailable (older
 * browsers) or the browser blocks autoplay before a user gesture.
 */
async function playPremiumSuccessJingle(): Promise<void> {
  try {
    const AudioCtx =
      (window as unknown as { AudioContext?: typeof AudioContext })
        .AudioContext ??
      (
        window as unknown as { webkitAudioContext?: typeof AudioContext }
      ).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    const now = ctx.currentTime;

    // Graceful fade-in so the first tick feels velvet, not hard.
    master.gain.exponentialRampToValueAtTime(0.32, now + 0.04);
    // Long tail — last note decays over ~1.4s.
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);

    // C5, E5, G5 — a warm major triad "cash register bell" feel.
    const notes: Array<{ freq: number; at: number; dur: number }> = [
      { freq: 523.25, at: 0.0, dur: 0.22 },
      { freq: 659.25, at: 0.11, dur: 0.22 },
      { freq: 783.99, at: 0.22, dur: 0.9 },
    ];

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = n.freq;
      g.gain.setValueAtTime(0.0001, now + n.at);
      g.gain.exponentialRampToValueAtTime(0.7, now + n.at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur);
      osc.connect(g);
      g.connect(master);
      osc.start(now + n.at);
      osc.stop(now + n.at + n.dur + 0.04);
    }

    // Close the context after the tail so we don't leak audio nodes.
    window.setTimeout(() => {
      try {
        void ctx.close();
      } catch {
        /* ignore */
      }
    }, 2000);
  } catch {
    /* autoplay blocked or AudioContext unavailable — silent fallback */
  }
}

/**
 * V1.7.1 — Lightweight canvas confetti. Self-contained, zero dependencies,
 * ~100 pieces falling with mild horizontal drift for ~2.4s then stops.
 * Lives on a fixed top-layer canvas that is removed after the run.
 */
function playOneShotConfetti(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.getElementById('safari-confetti-canvas')) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'safari-confetti-canvas';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '60';
  document.body.appendChild(canvas);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  };
  resize();

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const palette = ['#D4AF37', '#F5E6B3', '#C0C0C0', '#8EC5FC', '#1E3A5F'];
  const w = () => window.innerWidth;
  const h = () => window.innerHeight;
  const pieces = Array.from({ length: 120 }).map(() => ({
    x: w() / 2 + (Math.random() - 0.5) * 140,
    y: h() * 0.28 + (Math.random() - 0.5) * 40,
    vx: (Math.random() - 0.5) * 7,
    vy: -Math.random() * 9 - 3,
    g: 0.18 + Math.random() * 0.1,
    size: 5 + Math.random() * 6,
    color: palette[Math.floor(Math.random() * palette.length)],
    rot: Math.random() * Math.PI,
    vrot: (Math.random() - 0.5) * 0.3,
    drag: 0.985,
  }));

  const start = performance.now();
  const duration = 2400;
  let rafId = 0;

  const frame = (t: number) => {
    const elapsed = t - start;
    ctx.clearRect(0, 0, w(), h());
    for (const p of pieces) {
      p.vx *= p.drag;
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - elapsed / duration);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.45);
      ctx.restore();
    }
    if (elapsed < duration) {
      rafId = window.requestAnimationFrame(frame);
    } else {
      window.cancelAnimationFrame(rafId);
      canvas.remove();
      window.removeEventListener('resize', resize);
    }
  };

  window.addEventListener('resize', resize);
  rafId = window.requestAnimationFrame(frame);
}

/** Pretty display for the short order code — falls back sensibly if DB has nothing. */
function resolveDisplayOrderCode(status: PublicPaymentStatus | null): string | null {
  const serial = status?.serialNumber?.trim();
  if (serial) return serial;
  const inv = status?.invoiceNumber?.trim();
  if (inv) return inv;
  return null;
}

/**
 * Build a WhatsApp share URL for the invoice. Uses `wa.me` which works
 * on desktop and mobile without an app install.
 */
function buildWhatsappShareUrl(
  status: PublicPaymentStatus | null,
  orderCode: string | null,
): string | null {
  const shareUrl = status?.shareUrl?.trim();
  if (!shareUrl) return null;
  const amount = status?.amountKd
    ? ` (${formatKwdLabel(status.amountKd)})`
    : '';
  const codeLabel = orderCode ? `رقم الطلب ${orderCode}` : 'فاتورتك';
  const text = `${codeLabel}${amount}\nشكراً لاختياركم ${BRAND.customerAr}.\nيمكنكم استعراض الإيصال هنا:\n${shareUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function PaymentResultPage({
  mode,
}: {
  mode: 'success' | 'failed';
}) {
  const { search } = useLocation();
  const orderId = useMemo(
    () => resolveOrderIdFromPaymentReturnUrl(search),
    [search],
  );
  const returnGatewayTrackId = useMemo(
    () => resolveReturnGatewayTrackIdFromSearch(search),
    [search],
  );
  const returnGatewayResult = useMemo(
    () => resolveGatewayReturnResultFromSearch(search),
    [search],
  );

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
        gatewayResult: returnGatewayResult || undefined,
      });
      setRecheckResult(r);
      setStatus({
        orderId: r.orderId,
        status: r.status,
        isPaid: r.isPaid,
        amountKd: r.amountKd,
        serialNumber: r.serialNumber ?? null,
        invoiceNumber: r.invoiceNumber ?? null,
        pdfUrl: r.pdfUrl ?? null,
        shareUrl: r.shareUrl ?? null,
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
  }, [orderId, recheckBusy, returnGatewayTrackId, returnGatewayResult]);

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
          gatewayResult: returnGatewayResult || undefined,
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
      // Stop polling after ~90s — if nothing has landed by then, the
      // gateway most likely won't send a webhook at all (cancelled /
      // expired session).
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
  }, [orderId, returnGatewayTrackId, returnGatewayResult]);

  /** Never show «تم الدفع بنجاح» from the route alone — only after API confirms `isPaid`. */
  const resolvedMode: 'success' | 'failed' | 'pending' = useMemo(() => {
    if (status?.isPaid) return 'success';
    if (mode === 'failed') return 'failed';
    if (mode === 'success') return 'pending';
    return 'pending';
  }, [mode, status]);

  // Fire premium jingle + confetti on the FIRST transition into success —
  // never on subsequent renders. We latch via `celebratedRef` so that
  // background polling or re-mounts do not replay the animation.
  const celebratedRef = useRef(false);
  useLayoutEffect(() => {
    if (resolvedMode === 'success' && !celebratedRef.current) {
      celebratedRef.current = true;
      void playPremiumSuccessJingle();
      playOneShotConfetti();
    }
  }, [resolvedMode]);

  const orderCode = useMemo(() => resolveDisplayOrderCode(status), [status]);
  const waHref = useMemo(
    () => buildWhatsappShareUrl(status, orderCode),
    [status, orderCode],
  );

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden bg-[#0B1B3A]"
    >
      <LuxuryBackdrop />
      <div
        className="
          relative w-full max-w-md rounded-[28px] overflow-hidden
          border border-white/15 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]
          backdrop-blur-xl bg-white/10
        "
      >
        <ReceiptHeader />

        <div className="px-6 sm:px-7 py-8 text-center text-slate-50">
          {resolvedMode === 'success' ? (
            <SuccessBlock
              status={status}
              orderCode={orderCode}
              waHref={waHref}
            />
          ) : resolvedMode === 'failed' ? (
            <FailedBlock
              status={status}
              orderCode={orderCode}
              onRecheck={handleManualRecheck}
              recheckBusy={recheckBusy}
              hasOrderId={Boolean(orderId)}
            />
          ) : (
            <PendingBlock
              status={status}
              orderCode={orderCode}
              secondsElapsed={secondsElapsed}
              onRecheck={handleManualRecheck}
              recheckBusy={recheckBusy}
              hasOrderId={Boolean(orderId)}
            />
          )}

          {recheckResult && !recheckResult.isPaid && (
            <p className="mt-5 text-sm text-amber-100/95 bg-amber-500/10 rounded-xl p-3 border border-amber-300/30 leading-6">
              {recheckResult.messageAr}
            </p>
          )}
          {recheckResult?.isPaid && recheckResult.settledNow && (
            <p className="mt-5 text-sm text-emerald-100/95 bg-emerald-500/10 rounded-xl p-3 border border-emerald-300/30 leading-6">
              {recheckResult.messageAr}
            </p>
          )}

          {error && (
            <p className="mt-5 text-sm text-rose-100/95 bg-rose-500/10 rounded-xl p-3 border border-rose-300/30 leading-6">
              {error}
            </p>
          )}
        </div>

        <ReceiptFooter />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Presentational fragments                                            */
/* ------------------------------------------------------------------ */

function LuxuryBackdrop() {
  return (
    <>
      {/* Deep royal-navy wash with soft golden radial glows in the corners. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-[#0B1B3A] via-[#102347] to-[#05132E]"
      />
      <div
        aria-hidden
        className="absolute -top-24 -right-24 w-96 h-96 rounded-full blur-3xl opacity-40"
        style={{
          background:
            'radial-gradient(circle, rgba(212,175,55,0.55) 0%, rgba(212,175,55,0) 70%)',
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-32 -left-20 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-25"
        style={{
          background:
            'radial-gradient(circle, rgba(192,192,220,0.5) 0%, rgba(192,192,220,0) 70%)',
        }}
      />
    </>
  );
}

function ReceiptHeader() {
  // V1.7.2 — Owner directive: drop the S-monogram; keep only the brand
  // wordmark + tagline so the header reads as an official digital
  // receipt without competing visual elements.
  return (
    <div className="relative px-6 sm:px-7 pt-8 pb-5 text-center border-b border-white/10">
      <h1 className="text-base font-semibold tracking-wide text-white">
        {BRAND.customerAr}
      </h1>
      <p className="mt-2 text-[11px] uppercase tracking-[0.35em] text-[#F1D27A]/90">
        Safari · Digital Receipt
      </p>
    </div>
  );
}

function ReceiptFooter() {
  return (
    <div className="border-t border-white/10 px-6 py-4 text-center text-[11px] text-white/70">
      للاستفسار هاتفياً:{' '}
      <a
        href="tel:22200299"
        className="font-semibold text-[#F1D27A] tracking-wider hover:text-[#F7E1A0]"
      >
        22200299
      </a>
    </div>
  );
}

function AnimatedCheck() {
  return (
    <div className="relative mx-auto w-24 h-24">
      <span
        aria-hidden
        className="
          absolute inset-0 rounded-full
          bg-gradient-to-br from-emerald-400/30 to-emerald-300/10
          animate-[safari-pulse_2.4s_ease-out_infinite]
        "
      />
      <span
        aria-hidden
        className="
          absolute inset-1.5 rounded-full
          bg-gradient-to-br from-emerald-400 to-emerald-600
          shadow-[0_10px_30px_-6px_rgba(16,185,129,0.65)]
        "
      />
      <svg
        viewBox="0 0 52 52"
        className="relative w-full h-full"
        aria-hidden
      >
        <circle
          cx="26"
          cy="26"
          r="24"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1.5"
          className="safari-check-ring"
        />
        <path
          d="M15 27 L23 35 L38 19"
          fill="none"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="safari-check-path"
        />
      </svg>
      <style>
        {`
          @keyframes safari-pulse {
            0%, 100% { transform: scale(1); opacity: 0.55; }
            50%      { transform: scale(1.08); opacity: 0.9; }
          }
          .safari-check-ring {
            stroke-dasharray: 160;
            stroke-dashoffset: 160;
            animation: safari-draw-ring 0.9s ease-out 0.05s forwards;
          }
          .safari-check-path {
            stroke-dasharray: 48;
            stroke-dashoffset: 48;
            animation: safari-draw-check 0.55s cubic-bezier(.6,.2,.2,1) 0.55s forwards;
          }
          @keyframes safari-draw-ring {
            to { stroke-dashoffset: 0; }
          }
          @keyframes safari-draw-check {
            to { stroke-dashoffset: 0; }
          }
        `}
      </style>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-xs uppercase tracking-[0.2em] text-white/60">
        {label}
      </span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function SuccessBlock({
  status,
  orderCode,
  waHref,
}: {
  status: PublicPaymentStatus | null;
  orderCode: string | null;
  waHref: string | null;
}) {
  // V1.7.3 — "Download PDF" now points at the SAME thermal receipt the
  // WhatsApp share uses (PublicInvoicePage). We append `?autoprint=1`
  // so the browser's native print dialog auto-opens once the receipt
  // has mounted — "Save as PDF" is one tap on every modern browser,
  // Arabic renders natively, the logo/barcode/QR come out pixel-perfect,
  // and the payment stamp auto-flips to "تم الدفع أونلاين ✅" because
  // the order's cashStatus is already PAID_ONLINE at this point.
  const shareUrl = status?.shareUrl?.trim() || null;
  const downloadHref = shareUrl
    ? `${shareUrl}${shareUrl.includes('?') ? '&' : '?'}autoprint=1`
    : null;
  return (
    <>
      <AnimatedCheck />
      <h2 className="mt-5 text-2xl font-bold tracking-tight text-white">
        تم الدفع بنجاح
      </h2>
      <p className="mt-2 text-white/70 leading-7 text-sm">
        شكراً لاختياركم خدماتنا. تم استلام الدفع وتأكيد طلبكم.
      </p>

      {status && (
        <div
          className="
            mt-6 rounded-2xl border border-white/15 bg-white/5
            px-5 py-4 divide-y divide-white/10
          "
        >
          <FieldRow
            label="المبلغ المدفوع"
            value={formatKwdLabel(status.amountKd)}
          />
          {orderCode && <FieldRow label="رقم الطلب" value={orderCode} />}
          <FieldRow label="الحالة" value="مؤكَّد" />
        </div>
      )}

      <div className="mt-6 grid gap-2.5">
        {downloadHref && (
          <a
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer"
            className="
              inline-flex items-center justify-center gap-2 rounded-xl
              bg-gradient-to-br from-[#F1D27A] via-[#D4AF37] to-[#A67C20]
              text-[#0B1B3A] font-semibold py-2.5 px-4
              shadow-[0_10px_25px_-8px_rgba(212,175,55,0.75)]
              hover:brightness-105 transition
            "
          >
            <Download className="w-4 h-4" />
            تحميل الفاتورة PDF
          </a>
        )}
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="
              inline-flex items-center justify-center gap-2 rounded-xl
              bg-emerald-500/90 hover:bg-emerald-500 text-white
              font-semibold py-2.5 px-4 shadow-[0_8px_20px_-8px_rgba(16,185,129,0.6)]
              transition
            "
          >
            <Share2 className="w-4 h-4" />
            مشاركة الإيصال عبر واتساب
          </a>
        )}
        <a
          href="/"
          className="
            inline-flex items-center justify-center gap-2 rounded-xl
            border border-white/25 bg-white/5 hover:bg-white/10
            text-white font-medium py-2.5 px-4 transition
          "
        >
          <Home className="w-4 h-4" />
          العودة للرئيسية
        </a>
      </div>

      <p className="mt-6 text-[11px] text-white/50 tracking-wide">
        يمكنك إغلاق هذه الصفحة الآن — تمّ حفظ العملية لدينا بالكامل.
      </p>
    </>
  );
}

function FailedBlock({
  status,
  orderCode,
  onRecheck,
  recheckBusy,
  hasOrderId,
}: {
  status: PublicPaymentStatus | null;
  orderCode: string | null;
  onRecheck: () => void;
  recheckBusy: boolean;
  hasOrderId: boolean;
}) {
  return (
    <>
      <div
        className="
          mx-auto w-20 h-20 rounded-full flex items-center justify-center
          bg-gradient-to-br from-rose-500/30 to-rose-700/30
          border border-rose-300/30
        "
      >
        <XCircle className="w-10 h-10 text-rose-300" strokeWidth={2.2} />
      </div>
      <h2 className="mt-4 text-xl font-bold text-white tracking-tight">
        لم يكتمل الدفع
      </h2>
      <p className="mt-2 text-white/75 leading-7 text-sm">
        تم إلغاء عملية الدفع أو انتهت المهلة قبل تأكيدها من البنك.
      </p>

      {status && (
        <div
          className="
            mt-5 rounded-2xl border border-white/15 bg-white/5
            px-5 py-4 divide-y divide-white/10
          "
        >
          <FieldRow
            label="المبلغ المطلوب"
            value={formatKwdLabel(status.amountKd)}
          />
          {orderCode && <FieldRow label="رقم الطلب" value={orderCode} />}
        </div>
      )}

      <div className="mt-6 grid gap-2.5">
        <Button
          type="button"
          onClick={onRecheck}
          disabled={!hasOrderId || recheckBusy}
          className="
            bg-emerald-500 hover:bg-emerald-500/90 text-white
            shadow-[0_8px_20px_-8px_rgba(16,185,129,0.6)]
          "
        >
          <ShieldCheck className="w-4 h-4 ms-2" />
          {recheckBusy ? 'جارٍ التحقق…' : 'إعادة التحقق من الدفع'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => window.location.reload()}
          className="border-white/25 bg-white/5 hover:bg-white/10 text-white"
        >
          <RefreshCw className="w-4 h-4 ms-2" />
          تحديث حالة الطلب
        </Button>
        <a
          href="/"
          className="
            inline-flex items-center justify-center gap-2 rounded-xl
            border border-white/15 bg-transparent hover:bg-white/5
            text-white/80 font-medium py-2.5 px-4 transition
          "
        >
          <Home className="w-4 h-4" />
          العودة للرئيسية
        </a>
        <p className="text-xs text-white/60 mt-2 leading-6">
          إن كنت أتممت الدفع من البنك ولم يتغيّر الحال، اضغط «إعادة التحقق من الدفع». إن استمرّت المشكلة تواصل مع مركز الخدمة.
        </p>
      </div>
    </>
  );
}

function PendingBlock({
  status,
  orderCode,
  secondsElapsed,
  onRecheck,
  recheckBusy,
  hasOrderId,
}: {
  status: PublicPaymentStatus | null;
  orderCode: string | null;
  secondsElapsed: number;
  onRecheck: () => void;
  recheckBusy: boolean;
  hasOrderId: boolean;
}) {
  return (
    <>
      <div
        className="
          mx-auto w-20 h-20 rounded-full flex items-center justify-center
          bg-gradient-to-br from-amber-400/25 to-amber-600/25
          border border-amber-200/30
        "
      >
        <Clock
          className="w-10 h-10 text-amber-200 animate-pulse"
          strokeWidth={2.2}
        />
      </div>
      <h2 className="mt-4 text-xl font-bold text-white tracking-tight">
        جاري التحقق من الدفع…
      </h2>
      <p className="mt-2 text-white/75 leading-7 text-sm">
        استلمنا عودتك من بوّابة الدفع. نقوم بالتحقق من تأكيد البنك تلقائياً،
        قد يستغرق الأمر بضع ثوانٍ.
      </p>

      {status && (
        <div
          className="
            mt-5 rounded-2xl border border-white/15 bg-white/5
            px-5 py-4 divide-y divide-white/10
          "
        >
          <FieldRow label="المبلغ" value={formatKwdLabel(status.amountKd)} />
          {orderCode && <FieldRow label="رقم الطلب" value={orderCode} />}
        </div>
      )}

      <p className="mt-3 text-[11px] text-white/50 tabular-nums">
        جاري الفحص… ({secondsElapsed}s)
      </p>
      <div className="mt-5 grid gap-2.5">
        <Button
          type="button"
          onClick={onRecheck}
          disabled={!hasOrderId || recheckBusy}
          className="
            bg-emerald-500 hover:bg-emerald-500/90 text-white
            shadow-[0_8px_20px_-8px_rgba(16,185,129,0.6)]
          "
        >
          <ShieldCheck className="w-4 h-4 ms-2" />
          {recheckBusy ? 'جارٍ التحقق…' : 'إعادة التحقق من الدفع'}
        </Button>
        <p className="text-[11px] text-white/55 leading-5">
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
