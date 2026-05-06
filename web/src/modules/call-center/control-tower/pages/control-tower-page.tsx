import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radar } from 'lucide-react';
import type { ControlTowerQueryFilters } from '../api/control-tower-api';
import { useCcDrivers } from '@/modules/call-center/dashboard/hooks/use-cc-drivers';
import { ControlTowerFiltersBar } from '../components/control-tower-filters-bar';
import { ControlTowerDriverLoad } from '../components/driver-load';
import { ControlTowerKpiCards } from '../components/kpi-cards';
import { ControlTowerRiskTable } from '../components/risk-table';
import { useControlTower } from '../hooks/use-control-tower';

/**
 * Call Center Control Tower — real-time intelligence (read-only).
 */
export function ControlTowerPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState<ControlTowerQueryFilters>({
    preset: 'all',
    topLimit: 50,
  });

  const { data, loading, refreshing, transport, refresh } =
    useControlTower(query);

  const driversState = useCcDrivers();
  const driverPickList = useMemo(
    () =>
      (driversState.drivers ?? []).map((d) => ({ id: d.id, name: d.name })),
    [driversState.drivers],
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Radar className="size-5" aria-hidden />
        </div>
        <div>
          <h1 className="font-heading text-xl font-semibold">{t('controlTower.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('controlTower.subtitle')}</p>
          {data?.meta.generatedAt ? (
            <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
              {t('controlTower.generatedAt', {
                time: new Date(data.meta.generatedAt).toLocaleString('ar-KW', {
                  dateStyle: 'short',
                  timeStyle: 'medium',
                }),
              })}
            </p>
          ) : null}
        </div>
      </header>

      <ControlTowerFiltersBar
        value={query}
        onChange={setQuery}
        drivers={driverPickList}
        onRefresh={refresh}
        refreshing={refreshing}
        transport={transport}
      />

      <ControlTowerKpiCards kpis={data?.kpis ?? null} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ControlTowerRiskTable rows={data?.rows ?? []} loading={loading && !data} />
        </div>
        <ControlTowerDriverLoad drivers={data?.drivers ?? []} />
      </div>
    </div>
  );
}
