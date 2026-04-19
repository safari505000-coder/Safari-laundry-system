import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  HandCoins,
  Info,
  Landmark,
  Loader2,
  RefreshCw,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, apiJson, type OrderRow } from '@/lib/api';
import { isVisibleOn } from '@/modules/shared/invoice/lifecycle';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
} from '@/modules/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { cn } from '@/lib/utils';

/*
 * Dastur §3 — Driver's personal custody ("عهدتي الشخصية") as a LIVE STATEMENT.
 *
 * This page is DRIVER-only (see RequireRoles below). The manager-side
 * bank-deposit flow (photo of slip + accountant verification) lives on a
 * completely separate route (/manager/custody → MyCustodyPage) and is NOT
 * affected by this refactor.
 *
 * V3.8 cleanup:
 *  - Removed the "Pending invoices" (الفواتير المعلقة) table. Invoices
 *    are now the sole responsibility of the Field Collection Tracker
 *    at `/driver/pending-invoices`. This page becomes a focused liability
 *    dashboard (method tiles + grand total + handover CTA).
 *  - Every KWD value renders at exactly 3 decimals (KWD standard).
 *  - A status pill sits next to the "Notify Manager" button and reflects
 *    the settlement state: Neutral / Pending / Rejected.
 *
 * V4.4 "Money Sources" directive:
 *  - The Payment-Link tile is hidden. Link-method invoices are settled
 *    online (customer → gateway → ledger) and never flow through the
 *    driver's bag, so they don't belong in the driver's custody view.
 *  - `grandTotal` now aggregates Cash + K-Net only.
 */

/**
 * V3.8 constitution: all KWD amounts on this page render with exactly
 * three decimals (fils). Scoped to this file so we don't disturb the
 * shared `formatKwdLabel` helper which other screens still rely on with
 * its 2–4 dp tolerance.
 */
const KWD_SUFFIX = ' د.ك';
function formatKwd3(value: string | number): string {
  const n = typeof value === 'number' ? value : Number.parseFloat(value || '0');
  if (!Number.isFinite(n)) return `${String(value)}${KWD_SUFFIX}`;
  return `${n.toLocaleString('en-KW', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })}${KWD_SUFFIX}`;
}

function sumTotals(list: OrderRow[]): number {
  let n = 0;
  for (const r of list) n += Number.parseFloat(r.totalPrice) || 0;
  return n;
}

/**
 * Local settlement-status state machine.
 *
 * The driver→manager handover is a UI handshake only — there is no
 * `SettlementRequest` / `DriverHandoverRequest` record on the backend
 * today (verified: `prisma/schema.prisma` has `ManagerCashCustody.
 * rejectionReason`, but that models the accountant→manager rejection,
 * not the manager→driver one). Until a dedicated backing record ships
 * we persist the "Sent" flag client-side with a 24 h TTL and auto-clear
 * it when the driver's pending total drops to zero (the moment the
 * manager taps "Confirm Receipt" and the orders leave PAID_TO_DRIVER).
 *
 * The `Rejected` branch is UI-complete; wire the manager's reason into
 * `rejectedReason` below when the endpoint is available.
 */
type SettlementStatus =
  | { kind: 'neutral' }
  | { kind: 'pending'; sentAtIso: string }
  | { kind: 'rejected'; reason: string };

const HANDOVER_FLAG_TTL_MS = 24 * 60 * 60 * 1000;

function handoverStorageKey(userId: string | undefined): string | null {
  if (!userId) return null;
  return `safari.driverCustody.lastHandover.${userId}`;
}

function readHandoverFlag(userId: string | undefined): string | null {
  try {
    const key = handoverStorageKey(userId);
    if (!key || typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const ts = Date.parse(raw);
    if (!Number.isFinite(ts)) return null;
    if (Date.now() - ts > HANDOVER_FLAG_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return new Date(ts).toISOString();
  } catch {
    return null;
  }
}

function writeHandoverFlag(userId: string | undefined, iso: string | null) {
  try {
    const key = handoverStorageKey(userId);
    if (!key || typeof window === 'undefined') return;
    if (iso) window.localStorage.setItem(key, iso);
    else window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable (private mode etc.) — silently degrade */
  }
}

function MyCustodyContent() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [sentAtIso, setSentAtIso] = useState<string | null>(() =>
    readHandoverFlag(user?.id),
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiJson<OrderRow[]>('/api/orders', { token });
      setOrders(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSentAtIso(readHandoverFlag(user?.id));
  }, [user?.id]);

  /*
   * "Pending" = orders the driver has collected cash for but hasn't yet
   * handed to the branch manager. Per the Invoice Constitution
   * (`@/modules/shared/invoice/lifecycle`) that is exactly the
   * `driverMyDeposits` scope (lifecycle state PAID_TO_DRIVER). The
   * additional `status === 'COMPLETED'` guard is preserved so a
   * partially-progressed order (PICKED_UP / IN_PROGRESS) never
   * surfaces here even if an upstream bug ever flips its cashStatus
   * early.
   */
  const pending = useMemo(
    () =>
      (orders ?? []).filter(
        (o) => o.status === 'COMPLETED' && isVisibleOn(o, 'driverMyDeposits'),
      ),
    [orders],
  );

  const cashRows = useMemo(
    () => pending.filter((o) => o.posPaymentMethod === 'CASH'),
    [pending],
  );
  const knetRows = useMemo(
    () => pending.filter((o) => o.posPaymentMethod === 'KNET'),
    [pending],
  );
  // V4.4 — "Money Sources" directive: driver custody only tracks physical
  // money held by the driver. Payment-link invoices are settled online by
  // the customer (gateway → ledger) and never pass through the driver's
  // bag, so they are deliberately excluded from both the tiles and the
  // grand total on this page. See `/driver/pending-invoices` for a full
  // view that still lists link-method invoices for follow-up.

  const cashTotal = useMemo(() => sumTotals(cashRows), [cashRows]);
  const knetTotal = useMemo(() => sumTotals(knetRows), [knetRows]);
  const grandTotal = cashTotal + knetTotal;

  const hasAnyPending = grandTotal > 0;

  useEffect(() => {
    // Manager approved → balance cleared → retire the local "Sent" flag.
    if (orders !== null && !hasAnyPending && sentAtIso) {
      writeHandoverFlag(user?.id, null);
      setSentAtIso(null);
    }
  }, [orders, hasAnyPending, sentAtIso, user?.id]);

  // Placeholder for a future "manager rejected your handover" signal.
  // There is no backing record today, so this stays null and the pill
  // never flips to Rejected. Swap in the real feed when the endpoint
  // lands (see file-header note).
  const rejectedReason: string | null = null;

  const status: SettlementStatus = rejectedReason
    ? { kind: 'rejected', reason: rejectedReason }
    : sentAtIso && hasAnyPending
    ? { kind: 'pending', sentAtIso }
    : { kind: 'neutral' };

  function notifyManager() {
    /*
     * Strict "no-backend-change" constraint: this button is a pure UI
     * handshake. The branch manager already sees the driver's live
     * totals via /api/finance/driver-balance on their dashboard
     * (MyCustodyPage → "Driver Handover Approval" section). So
     * "notifying" them really just means:
     *   1. confirm the driver read and agrees with their totals, and
     *   2. flip the local status pill to "Sent — Waiting for Manager"
     *      so they don't keep tapping.
     */
    const iso = new Date().toISOString();
    writeHandoverFlag(user?.id, iso);
    setSentAtIso(iso);
    toast.success(t('myDeposits.notifyManagerSuccess'));
    setNotifyOpen(false);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-2 py-4 sm:px-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('myDeposits.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('myDeposits.subtitle')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
          aria-label="refresh"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </header>

      {/* Dastur §3 — explicit driver-facing liability instruction. */}
      <div
        role="note"
        className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 shadow-sm"
      >
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        <p>{t('myDeposits.alert')}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <MethodTile
          icon={<HandCoins className="h-4 w-4" aria-hidden />}
          label={t('myDeposits.methodCash')}
          total={cashTotal}
          count={cashRows.length}
          tone="amber"
        />
        <MethodTile
          icon={<Landmark className="h-4 w-4" aria-hidden />}
          label={t('myDeposits.methodKnet')}
          total={knetTotal}
          count={knetRows.length}
          tone="sky"
        />
        {/*
          V4.4 — "Payment Link" card intentionally hidden.
          Link-method invoices are settled online; the driver never holds
          that money, so it does not belong in the custody dashboard.
        */}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <Banknote className="h-4 w-4" aria-hidden />
          {t('myDeposits.grandTotalLabel')}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-lg font-semibold tabular-nums text-zinc-900">
            {formatKwd3(grandTotal)}
          </div>
          <SettlementStatusPill status={status} />
          <Button
            type="button"
            className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={
              !hasAnyPending || orders === null || status.kind === 'pending'
            }
            onClick={() => setNotifyOpen(true)}
          >
            <Send className="h-4 w-4" aria-hidden />
            {t('myDeposits.notifyManagerCta')}
          </Button>
        </div>
      </div>

      <Dialog
        open={notifyOpen}
        onOpenChange={(open) => setNotifyOpen(open)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('myDeposits.notifyManagerTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {t('myDeposits.notifyManagerBody')}
            </p>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3 tabular-nums">
              <DialogLine
                label={t('myDeposits.methodCash')}
                value={cashTotal}
                count={cashRows.length}
              />
              <DialogLine
                label={t('myDeposits.methodKnet')}
                value={knetTotal}
                count={knetRows.length}
              />
              {/*
                V4.4 — Payment Link summary omitted. It's settled online
                and never enters the driver→manager handover.
              */}
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{t('myDeposits.grandTotalLabel')}</span>
                <span>{formatKwd3(grandTotal)}</span>
              </div>
            </div>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t('myDeposits.notifyManagerHint24h')}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNotifyOpen(false)}
            >
              {t('myDeposits.notifyManagerCancel')}
            </Button>
            <Button
              type="button"
              className="bg-slate-900 text-white hover:bg-slate-800"
              onClick={notifyManager}
            >
              {t('myDeposits.notifyManagerOk')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettlementStatusPill({ status }: { status: SettlementStatus }) {
  const { t } = useTranslation();

  if (status.kind === 'rejected') {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-800"
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        <span>
          {t('myDeposits.statusRejected', { reason: status.reason })}
        </span>
      </span>
    );
  }

  if (status.kind === 'pending') {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
      >
        <Clock className="h-3.5 w-3.5" aria-hidden />
        {t('myDeposits.statusPending')}
      </span>
    );
  }

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
    >
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      {t('myDeposits.statusReady')}
    </span>
  );
}

function MethodTile({
  icon,
  label,
  total,
  count,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  total: number;
  count: number;
  tone: 'amber' | 'sky' | 'violet';
}) {
  const { t } = useTranslation();
  const toneClass =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50/60 text-amber-900'
      : tone === 'sky'
        ? 'border-sky-200 bg-sky-50/60 text-sky-900'
        : 'border-violet-200 bg-violet-50/60 text-violet-900';
  return (
    <Card className={cn('border shadow-sm', toneClass)}>
      <CardContent className="flex items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="rounded-md bg-white/70 p-1.5 text-current shadow-sm"
          >
            {icon}
          </span>
          <div>
            <p className="text-xs opacity-80">{label}</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {formatKwd3(total)}
            </p>
          </div>
        </div>
        <div className="text-xs opacity-75">
          {count} {t('myDeposits.invoiceCountSuffix')}
        </div>
      </CardContent>
    </Card>
  );
}

function DialogLine({
  label,
  value,
  count,
}: {
  label: string;
  value: number;
  count: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">
        {label}
        <span className="ms-1 opacity-70">
          ({count} {t('myDeposits.invoiceCountSuffix')})
        </span>
      </span>
      <span>{formatKwd3(value)}</span>
    </div>
  );
}

export function MyDepositsPage() {
  return <MyCustodyContent />;
}
