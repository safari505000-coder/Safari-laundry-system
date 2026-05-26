import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, ExternalLink, Phone, RefreshCw, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  listWebsiteCustomerPayments,
  type WebsiteCustomerPaymentFilter,
  type WebsiteCustomerPaymentRow,
} from '@/lib/api';
import { formatKwdLabelGrouped } from '@/lib/kwd';

const FILTER_TABS: WebsiteCustomerPaymentFilter[] = ['PENDING', 'PAID', 'ALL'];

const STATUS_LABELS: Record<
  WebsiteCustomerPaymentRow['paymentStatus'],
  string
> = {
  UNPAID: 'غير مدفوعة',
  PARTIALLY_PAID: 'جزئية',
  PAID: 'مدفوعة',
};

/**
 * Call-center queue for customer payments initiated from the public website.
 */
export function WebsiteCustomerPaymentsPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const canView = user != null && can(user, 'websiteCustomerPayments.view');

  const [rows, setRows] = useState<WebsiteCustomerPaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<WebsiteCustomerPaymentFilter>('PENDING');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listWebsiteCustomerPayments(token, {
        status: statusFilter,
      });
      setRows(res.payments);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : t('websiteCustomerPayments.loadFailed'),
      );
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(
    () =>
      rows.filter((row) => Number(row.remainingAmountKd) > 0.001).length,
    [rows],
  );

  if (!canView) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t('common.accessDenied')}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('websiteCustomerPayments.title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('websiteCustomerPayments.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('websiteCustomerPayments.refresh')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatusFilter(tab)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              statusFilter === tab
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {t(`websiteCustomerPayments.filter.${tab}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          label={t('websiteCustomerPayments.summaryShown')}
          value={String(rows.length)}
        />
        <SummaryCard
          label={t('websiteCustomerPayments.summaryPending')}
          value={String(pendingCount)}
        />
        <SummaryCard
          label={t('websiteCustomerPayments.summaryFilter')}
          value={t(`websiteCustomerPayments.filter.${statusFilter}`)}
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('websiteCustomerPayments.loading')}
        </p>
      ) : null}

      {!loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('websiteCustomerPayments.empty')}
        </p>
      ) : null}

      <div className="grid gap-4">
        {rows.map((row) => (
          <article
            key={row.orderId}
            className="rounded-xl border bg-card p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <span className="font-semibold">
                    {row.invoiceNumber ?? row.serialNumber ?? row.orderId.slice(0, 8)}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {STATUS_LABELS[row.paymentStatus]}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.customerDisplayName ?? row.customerPhone}
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>
                    {t('websiteCustomerPayments.remaining')}:{' '}
                    <strong>{formatKwdLabelGrouped(row.remainingAmountKd)}</strong>
                  </span>
                  <span>
                    {t('websiteCustomerPayments.total')}:{' '}
                    {formatKwdLabelGrouped(row.totalAmountKd)}
                  </span>
                </div>
                {row.requestedAtIso ? (
                  <p className="text-xs text-muted-foreground">
                    {t('websiteCustomerPayments.requestedAt')}:{' '}
                    {new Date(row.requestedAtIso).toLocaleString('ar-KW')}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/call-center/customers/${row.customerId}`}
                  className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <User className="h-4 w-4" />
                  {t('websiteCustomerPayments.openCustomer')}
                </Link>
                <a
                  href={`tel:${row.customerPhone}`}
                  className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <Phone className="h-4 w-4" />
                  {t('websiteCustomerPayments.call')}
                </a>
                {row.paymentUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(row.paymentUrl!);
                        toast.success(t('websiteCustomerPayments.linkCopied'));
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      {t('websiteCustomerPayments.copyLink')}
                    </button>
                    <a
                      href={row.paymentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t('websiteCustomerPayments.openLink')}
                    </a>
                  </>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
