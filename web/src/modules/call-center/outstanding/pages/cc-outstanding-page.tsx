import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/modules/shared/components/ui/button';
import { useCcDrivers } from '@/modules/call-center/dashboard/hooks/use-cc-drivers';
import {
  exportOutstandingXlsx,
  type OutstandingFilters,
  type OutstandingRow,
} from '../api/outstanding-api';
import { useOutstanding } from '../hooks/use-outstanding';
import { EditCollectionStatusDialog } from '../components/edit-collection-status-dialog';
import { OutstandingFiltersBar } from '../components/outstanding-filters-bar';
import { OutstandingTable } from '../components/outstanding-table';

function fmtKd(v: number | string): string {
  const n = typeof v === 'number' ? v : Number.parseFloat(v);
  return new Intl.NumberFormat('ar-KW', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number.isFinite(n) ? n : 0);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * V19.x — Outstanding Payments page (`/cc/outstanding`).
 *
 * Composes the filter bar, KPI strip, AR table and the manual edit
 * dialog. Read-only by default — the only mutation is launched from
 * the row's "edit status" action which posts to PATCH
 * /api/finance/customer/:id/status.
 */
export function CcOutstandingPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [filters, setFilters] = useState<OutstandingFilters>({});
  const [editTarget, setEditTarget] = useState<OutstandingRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, loading, refreshing, error, refresh } = useOutstanding(filters);
  if (
    data &&
    typeof data.totalDueKd !== 'string' &&
    typeof data.totalDueKd !== 'number'
  ) {
    throw new Error('Invalid totalDue source');
  }
  const driversState = useCcDrivers();
  const driverPickList = useMemo(
    () =>
      (driversState.drivers ?? []).map((d) => ({ id: d.id, name: d.name })),
    [driversState.drivers],
  );

  const handleExport = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const { blob, filename } = await exportOutstandingXlsx(token, filters);
      downloadBlob(blob, filename);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t('outstanding.export.failed', {
              defaultValue: 'تعذّر تصدير الملف',
            }),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wallet className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="font-heading text-xl font-semibold">
              {t('outstanding.title', {
                defaultValue: 'الذمم المدينة',
              })}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('outstanding.subtitle', {
                defaultValue:
                  'فواتير غير مدفوعة مجمَّعة لكل عميل — للمراجعة والتحصيل اليدوي.',
              })}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={exporting || !data}
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          {t('outstanding.export.button', { defaultValue: 'تصدير Excel' })}
        </Button>
      </header>

      <OutstandingFiltersBar
        filters={filters}
        onChange={setFilters}
        drivers={driverPickList}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-label="kpi"
      >
        <KpiTile
          label={t('outstanding.kpi.customers', { defaultValue: 'عدد العملاء' })}
          value={data ? String(data.totalCustomers) : '—'}
        />
        <KpiTile
          label={t('outstanding.kpi.invoices', {
            defaultValue: 'عدد الفواتير',
          })}
          value={data ? String(data.totalInvoices) : '—'}
        />
        <KpiTile
          label={t('outstanding.kpi.totalDue', {
            defaultValue: 'إجمالي المستحق (د.ك)',
          })}
          value={data ? fmtKd(data.totalDueKd) : '—'}
          tone="primary"
        />
        <KpiTile
          label={t('outstanding.kpi.blocked', {
            defaultValue: 'محظورون',
          })}
          value={data ? String(data.blockedCount) : '—'}
          tone={data && data.blockedCount > 0 ? 'danger' : 'muted'}
        />
      </section>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <OutstandingTable
        rows={data?.rows ?? []}
        loading={loading}
        onEditStatus={(row) => setEditTarget(row)}
      />

      <EditCollectionStatusDialog
        open={editTarget !== null}
        row={editTarget}
        onOpenChange={(next) => {
          if (!next) setEditTarget(null);
        }}
        onSaved={refresh}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary' | 'danger' | 'muted';
}) {
  const toneClass =
    tone === 'primary'
      ? 'text-primary'
      : tone === 'danger'
        ? 'text-rose-700 dark:text-rose-300'
        : tone === 'muted'
          ? 'text-muted-foreground'
          : 'text-foreground';
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
