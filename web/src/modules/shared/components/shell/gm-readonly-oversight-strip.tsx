import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { useSafariStream } from '@/contexts/safari-stream-context';
import { formatKwdLabel } from '@/lib/kwd';

/**
 * V19.30 — GENERAL_MANAGER: read-only banner + institution KPI strip + cash-flow hint.
 */
export function GeneralManagerReadOnlyOversightStrip() {
  const { t } = useTranslation();
  const { snapshot } = useSafariStream();
  const inst = snapshot?.institution;
  const fleet = snapshot?.managerCustody?.fleet;

  return (
    <div className="mb-4 space-y-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{t('shell.readOnlyModeBanner')}</p>
        </div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-center text-xs font-medium text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
        {t('shell.cashFlowFlow')}
      </div>
      {inst ?
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            label={t('gmKpis.netProfitDay')}
            value={formatKwdLabel(inst.financialDayNetProfitKd)}
          />
          <Kpi
            label={t('gmKpis.driverFieldCash')}
            value={formatKwdLabel(inst.allDriversFieldCashKd)}
          />
          <Kpi
            label={t('gmKpis.pendingDeposits')}
            value={formatKwdLabel(inst.allDriversPendingDepositsKd)}
          />
          <Kpi
            label={t('gmKpis.managerCustodyPending')}
            value={
              fleet ?
                formatKwdLabel(fleet.pendingAmountKd)
              : formatKwdLabel('0')
            }
          />
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-2 text-xs text-muted-foreground dark:border-zinc-700 dark:bg-zinc-950/40">
            {t('gmKpis.salesNote')}
          </div>
        </div>
      : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
    </div>
  );
}
