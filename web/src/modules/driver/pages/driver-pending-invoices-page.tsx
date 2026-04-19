import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import {
  type DriverPendingInvoiceRow,
  ApiError,
  apiJson,
} from '@/lib/api';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

/**
 * V3.8 — Driver Island: Field Collection Tracker
 * (كشف المتابعة الميدانية).
 *
 * STRICTLY READ-ONLY surface. Drivers view their own unpaid invoices
 * to plan the day's recoveries in the field — there are intentionally
 * NO action buttons (no WhatsApp, no Payment Link, no status mutations).
 * The Collections island (Call Center) remains the single place those
 * workflows live, preserving the "Isolated Islands" contract.
 *
 * Data contract:
 *   - `GET /api/orders/driver/pending-invoices`
 *   - Server scope: `driverId === me` AND `cashStatus === UNPAID` AND
 *     `status !== CANCELED`. Sort: `createdAt DESC`.
 *   - Amounts are serialized in KWD 3-decimal precision (fils).
 *   - Timezone for date rendering follows the user's locale — dates
 *     hit the server in ISO and `toLocaleString` resolves to the
 *     browser's Kuwait offset for staff on `Asia/Kuwait`.
 */

/** KWD 3dp formatter (local to this island; mirrors collections-page). */
const KWD_SUFFIX = ' د.ك';
function formatKwd3(value: string | number): string {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return `0.000${KWD_SUFFIX}`;
  return `${n.toFixed(3)}${KWD_SUFFIX}`;
}

/**
 * Arabic / English labels for `PosPaymentMethod`. Fallback to the raw
 * enum value so a backend-added method never silently renders blank.
 */
function formatPaymentMethod(
  pm: DriverPendingInvoiceRow['paymentMethod'],
  t: (key: string) => string,
): string {
  if (!pm) return t('driverPending.pm.unspecified');
  const key = `driverPending.pm.${pm}`;
  const translated = t(key);
  return translated === key ? pm : translated;
}

export function DriverPendingInvoicesPage() {
  const { t } = useTranslation();
  const { hasRole, token } = useAuth();
  const locale = useAppLocale();

  const [rows, setRows] = useState<DriverPendingInvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!token) return;
      if (!opts.silent) setLoading(true);
      try {
        const data = await apiJson<DriverPendingInvoiceRow[]>(
          '/api/orders/driver/pending-invoices',
          { token },
        );
        setRows(data);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Gate LAST so the hooks above always run in the same order.
  if (!hasRole('DRIVER')) return <Navigate to="/" replace />;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const hay = [
        r.readableId,
        r.invoiceNumber ?? '',
        r.customerName,
        r.customerPhone,
        r.notes ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const totalKd = useMemo(
    () =>
      filtered.reduce(
        (s, r) => s + (Number.parseFloat(r.amountKd) || 0),
        0,
      ),
    [filtered],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('driverPending.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('driverPending.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('driverPending.searchPlaceholder')}
              className="min-w-0 ps-8 sm:w-72"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            aria-label={t('driverPending.refresh')}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('driverPending.tableTitle')}</CardTitle>
          <div className="text-sm text-muted-foreground">
            {t('driverPending.totalLabel')}{' '}
            <span className="font-semibold tabular-nums text-foreground">
              {formatKwd3(totalKd)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-4">
          {/* Mobile: card-style list (readability on phones in the field). */}
          <ul className="space-y-3 p-4 sm:hidden">
            {filtered.length === 0 ? (
              <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {q.trim()
                  ? t('driverPending.emptySearch')
                  : t('driverPending.empty')}
              </li>
            ) : (
              filtered.map((row) => (
                <li
                  key={row.orderId}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="font-mono text-xs text-muted-foreground"
                      title={row.orderId}
                    >
                      {row.readableId}
                    </span>
                    <Badge
                      variant={row.pendingApproval ? 'secondary' : 'outline'}
                      className={
                        row.pendingApproval
                          ? 'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
                          : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
                      }
                    >
                      {row.pendingApproval
                        ? t('driverPending.badgePendingApproval')
                        : t('driverPending.badgeUnpaid')}
                    </Badge>
                  </div>
                  <p className="mt-1 font-semibold text-foreground">
                    {row.customerName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.customerPhone || '—'}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {formatPaymentMethod(row.paymentMethod, t)}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatKwd3(row.amountKd)}
                    </span>
                  </div>
                  {row.notes ? (
                    <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                      {row.notes}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {new Date(row.createdAtIso).toLocaleString(locale)}
                  </p>
                </li>
              ))
            )}
          </ul>

          {/* Desktop: full read-only table. */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('driverPending.colInvoice')}</TableHead>
                  <TableHead>{t('driverPending.colCustomer')}</TableHead>
                  <TableHead>{t('driverPending.colPhone')}</TableHead>
                  <TableHead className="text-end">
                    {t('driverPending.colAmount')}
                  </TableHead>
                  <TableHead>{t('driverPending.colPaymentMethod')}</TableHead>
                  <TableHead className="max-w-[320px]">
                    {t('driverPending.colNotes')}
                  </TableHead>
                  <TableHead>{t('driverPending.colStatus')}</TableHead>
                  <TableHead>{t('driverPending.colDate')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {q.trim()
                        ? t('driverPending.emptySearch')
                        : t('driverPending.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.orderId}>
                      <TableCell
                        className="font-mono text-xs"
                        title={row.orderId}
                      >
                        {row.readableId}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {row.customerName}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {row.customerPhone || '—'}
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">
                        {formatKwd3(row.amountKd)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatPaymentMethod(row.paymentMethod, t)}
                      </TableCell>
                      <TableCell className="max-w-[320px] whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {row.notes ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.pendingApproval ? 'secondary' : 'outline'
                          }
                          className={
                            row.pendingApproval
                              ? 'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
                              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
                          }
                        >
                          {row.pendingApproval
                            ? t('driverPending.badgePendingApproval')
                            : t('driverPending.badgeUnpaid')}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(row.createdAtIso).toLocaleString(locale)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
