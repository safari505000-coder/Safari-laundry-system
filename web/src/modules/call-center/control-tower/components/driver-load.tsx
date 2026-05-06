import { useTranslation } from 'react-i18next';
import { Truck } from 'lucide-react';
import type { ControlTowerDriverWorkload } from '../api/control-tower-api';

export function ControlTowerDriverLoad({
  drivers,
}: {
  drivers: ControlTowerDriverWorkload[];
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Truck className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">{t('controlTower.driverLoad.title')}</h2>
      </div>
      <ul className="max-h-80 divide-y overflow-y-auto p-2">
        {drivers.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t('controlTower.driverLoad.empty')}
          </li>
        ) : (
          drivers.map((d) => (
            <li
              key={d.driverId}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-2 py-2.5 text-sm hover:bg-muted/50"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{d.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t('controlTower.driverLoad.meta', {
                    assigned: d.assigned,
                    inProgress: d.inProgress,
                    late: d.late,
                  })}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
