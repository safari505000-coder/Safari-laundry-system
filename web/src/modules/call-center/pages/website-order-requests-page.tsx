import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Globe, Phone, RefreshCw, Send, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import { CreateDispatchDialog } from '@/modules/call-center/dashboard/components/create-dispatch-dialog';
import { buildWebsiteOrderDispatchNote } from '@/modules/call-center/website-order-dispatch-note';
import {
  ApiError,
  listWebsiteOrderRequests,
  updateWebsiteOrderRequestStatus,
  type WebsiteOrderRequestRow,
  type WebsiteOrderRequestStatus,
} from '@/lib/api';

type StatusFilter = 'ALL' | WebsiteOrderRequestStatus;

const STATUS_LABELS: Record<WebsiteOrderRequestStatus, string> = {
  NEW: 'جديد',
  CONTACTED: 'تم التواصل',
  CONVERTED: 'تم التحويل',
  CANCELLED: 'ملغى',
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  NORMAL: 'عادي',
  EXPRESS: 'مستعجل',
  URGENT: 'عاجل',
  VIP: 'VIP',
};

const FILTER_TABS: StatusFilter[] = [
  'ALL',
  'NEW',
  'CONTACTED',
  'CONVERTED',
  'CANCELLED',
];

/**
 * Call-center queue for public website pickup/order requests (W-xxxxx).
 */
export function WebsiteOrderRequestsPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const canAct = user != null && can(user, 'websiteOrderRequests.act');

  const [rows, setRows] = useState<WebsiteOrderRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('NEW');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listWebsiteOrderRequests(token, {
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });
      setRows(res.requests);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : t('websiteOrderRequests.loadFailed'),
      );
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { NEW: 0, CONTACTED: 0, CONVERTED: 0, CANCELLED: 0 };
    for (const row of rows) {
      c[row.status] += 1;
    }
    return c;
  }, [rows]);

  const handleStatus = async (
    row: WebsiteOrderRequestRow,
    status: WebsiteOrderRequestStatus,
  ) => {
    if (!token || !canAct || row.status === status) return;
    setBusyId(row.id);
    try {
      await updateWebsiteOrderRequestStatus(row.id, status, token);
      if (statusFilter !== 'ALL' && statusFilter !== status) {
        setRows((prev) => prev.filter((r) => r.id !== row.id));
      } else {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  status,
                  reviewedAtIso: new Date().toISOString(),
                }
              : r,
          ),
        );
      }
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : t('websiteOrderRequests.updateFailed'),
      );
    } finally {
      setBusyId(null);
    }
  };

  const summary = useMemo(
    () => [
      {
        label: t('websiteOrderRequests.summaryNew'),
        value: String(counts.NEW),
        color: counts.NEW > 0 ? 'text-red-600' : 'text-slate-500',
      },
      {
        label: t('websiteOrderRequests.summaryContacted'),
        value: String(counts.CONTACTED),
        color: 'text-amber-600',
      },
      {
        label: t('websiteOrderRequests.summaryShown'),
        value: String(rows.length),
        color: 'text-slate-800',
      },
    ],
    [counts, rows.length, t],
  );

  return (
    <div dir="rtl" className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Globe className="h-5 w-5 text-violet-600" />
            {t('websiteOrderRequests.title')}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
            {t('websiteOrderRequests.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('websiteOrderRequests.refresh')}
        </button>
      </div>

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
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatusFilter(tab)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              statusFilter === tab
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {tab === 'ALL'
              ? t('websiteOrderRequests.filterAll')
              : STATUS_LABELS[tab]}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {loading && rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            {t('websiteOrderRequests.loading')}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            {t('websiteOrderRequests.empty')}
          </div>
        ) : (
          rows.map((row) => (
            <RequestCard
              key={row.id}
              row={row}
              canAct={canAct}
              busy={busyId === row.id}
              onStatus={(status) => void handleStatus(row, status)}
              onDispatchCreated={() => void handleStatus(row, 'CONVERTED')}
            />
          ))
        )}
      </div>
    </div>
  );
}

function RequestCard({
  row,
  canAct,
  busy,
  onStatus,
  onDispatchCreated,
}: {
  row: WebsiteOrderRequestRow;
  canAct: boolean;
  busy: boolean;
  onStatus: (status: WebsiteOrderRequestStatus) => void;
  onDispatchCreated: () => void;
}) {
  const { t } = useTranslation();
  const [dispatchOpen, setDispatchOpen] = useState(false);

  const dispatchNote = useMemo(() => buildWebsiteOrderDispatchNote(row), [row]);

  const createdLabel = useMemo(() => {
    try {
      return new Date(row.createdAtIso).toLocaleString('ar-KW', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return row.createdAtIso;
    }
  }, [row.createdAtIso]);

  const items = useMemo(() => {
    if (!Array.isArray(row.requestedItems)) return [];
    return row.requestedItems.filter(
      (item): item is { label: string; quantity: number } =>
        item != null &&
        typeof item === 'object' &&
        'label' in item &&
        typeof (item as { label: unknown }).label === 'string',
    );
  }, [row.requestedItems]);

  const ringColor =
    row.status === 'NEW'
      ? 'border-violet-200 bg-violet-50/40 ring-2 ring-offset-1 ring-violet-200'
      : row.status === 'CONTACTED'
        ? 'border-amber-200 bg-amber-50/30'
        : row.status === 'CONVERTED'
          ? 'border-emerald-200 bg-emerald-50/30'
          : 'border-slate-200 bg-slate-50/40';

  const customerHref = row.customerId
    ? `/cc/customers/${row.customerId}`
    : `/call-incoming?phone=${encodeURIComponent(row.customerPhone)}`;

  return (
    <div className={`relative rounded-xl border p-4 shadow-sm ${ringColor}`}>
      {row.status === 'NEW' ? (
        <span className="absolute end-3 top-3 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
          {STATUS_LABELS.NEW}
        </span>
      ) : (
        <span className="absolute end-3 top-3 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
          {STATUS_LABELS[row.status]}
        </span>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-[100px] flex-col items-center rounded-xl bg-white p-2 shadow-sm">
          <div className="font-mono text-sm font-bold text-slate-900" dir="ltr">
            {row.publicReference}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">{createdLabel}</div>
          <div className="mt-1 text-[10px] font-medium text-violet-700">
            {SERVICE_TYPE_LABELS[row.serviceType] ?? row.serviceType}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-medium text-slate-800">
              {row.customerDisplayName ?? '—'}
            </span>
            <span className="text-slate-400">·</span>
            <span className="tabular-nums text-slate-700" dir="ltr">
              {row.customerPhone}
            </span>
          </div>

          {row.customerAddress ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">
              {row.customerAddress}
            </p>
          ) : null}

          {row.notes ? (
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-2.5 text-[13px] leading-relaxed text-slate-800 shadow-inner">
              {row.notes}
            </p>
          ) : null}

          {items.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
              {items.map((item, idx) => (
                <li key={`${item.label}-${idx}`}>
                  {item.label} × {item.quantity}
                </li>
              ))}
            </ul>
          ) : null}

          {row.reviewedAtIso ? (
            <div className="mt-2 text-[11px] text-slate-500">
              {t('websiteOrderRequests.reviewedAt')}: {row.reviewedAtIso}
              {row.reviewedBy?.fullName ? ` — ${row.reviewedBy.fullName}` : ''}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              to={customerHref}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <User className="h-3 w-3" />
              {t('websiteOrderRequests.openCustomer')}
            </Link>
            <a
              href={`tel:${row.customerPhone}`}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <Phone className="h-3 w-3" />
              {t('websiteOrderRequests.call')}
            </a>
            {row.customerId ? (
              <button
                type="button"
                onClick={() => setDispatchOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-800 hover:bg-violet-100"
              >
                <Send className="h-3 w-3" />
                {t('websiteOrderRequests.issueDispatch')}
              </button>
            ) : null}
          </div>

          {row.customerId ? (
            <CreateDispatchDialog
              open={dispatchOpen}
              onOpenChange={setDispatchOpen}
              customerId={row.customerId}
              customerName={row.customerDisplayName ?? row.customerPhone}
              isCustomerBlocked={false}
              defaultInstructionNote={dispatchNote}
              onCreated={onDispatchCreated}
            />
          ) : null}

          {canAct && row.status !== 'CONVERTED' && row.status !== 'CANCELLED' ? (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-200/80 pt-3">
              {row.status === 'NEW' ? (
                <ActionButton
                  label={t('websiteOrderRequests.markContacted')}
                  busy={busy}
                  onClick={() => onStatus('CONTACTED')}
                />
              ) : null}
              <ActionButton
                label={t('websiteOrderRequests.markConverted')}
                busy={busy}
                variant="success"
                onClick={() => onStatus('CONVERTED')}
              />
              <ActionButton
                label={t('websiteOrderRequests.markCancelled')}
                busy={busy}
                variant="muted"
                onClick={() => onStatus('CANCELLED')}
              />
            </div>
          ) : row.status === 'CONVERTED' ? (
            <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-emerald-700">
              <Check className="h-3 w-3" />
              {t('websiteOrderRequests.convertedHint')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  busy,
  variant = 'default',
  onClick,
}: {
  label: string;
  busy: boolean;
  variant?: 'default' | 'success' | 'muted';
  onClick: () => void;
}) {
  const cls =
    variant === 'success'
      ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
      : variant === 'muted'
        ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
        : 'bg-slate-900 hover:bg-slate-800 text-white';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium disabled:opacity-60 ${cls}`}
    >
      {busy ? '…' : label}
    </button>
  );
}
