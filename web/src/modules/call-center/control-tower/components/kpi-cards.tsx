import { useTranslation } from 'react-i18next';
import type { ControlTowerKpis } from '../api/control-tower-api';

function fmtKd(v: number): string {
  return new Intl.NumberFormat('ar-KW', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(v);
}

function Tile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary' | 'danger' | 'warning';
}) {
  const toneClass =
    tone === 'primary'
      ? 'text-primary'
      : tone === 'danger'
        ? 'text-rose-700 dark:text-rose-300'
        : tone === 'warning'
          ? 'text-amber-700 dark:text-amber-300'
          : 'text-foreground';
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-2 text-xl font-semibold tabular-nums sm:text-2xl ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

export function ControlTowerKpiCards({ kpis }: { kpis: ControlTowerKpis | null }) {
  const { t } = useTranslation();

  return (
    <section
      className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6"
      aria-label={t('controlTower.kpi.aria')}
    >
      <Tile
        label={t('controlTower.kpi.totalDue')}
        value={kpis ? fmtKd(kpis.totalDue) : '—'}
        tone="primary"
      />
      <Tile
        label={t('controlTower.kpi.customersDebt')}
        value={kpis ? String(kpis.customersWithDebt) : '—'}
      />
      <Tile
        label={t('controlTower.kpi.lateCustomers')}
        value={kpis ? String(kpis.lateCustomers) : '—'}
        tone={kpis && kpis.lateCustomers > 0 ? 'warning' : 'default'}
      />
      <Tile
        label={t('controlTower.kpi.riskCustomers')}
        value={kpis ? String(kpis.riskCustomers) : '—'}
        tone={kpis && kpis.riskCustomers > 0 ? 'danger' : 'default'}
      />
      <Tile
        label={t('controlTower.kpi.activeDispatches')}
        value={kpis ? String(kpis.activeDispatches) : '—'}
      />
      <Tile
        label={t('controlTower.kpi.slaBreached')}
        value={kpis ? String(kpis.slaBreached) : '—'}
        tone={kpis && kpis.slaBreached > 0 ? 'danger' : 'default'}
      />
    </section>
  );
}
