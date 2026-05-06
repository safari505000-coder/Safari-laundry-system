import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import type {
  ControlTowerPreset,
  ControlTowerQueryFilters,
} from '../api/control-tower-api';

type Props = {
  value: ControlTowerQueryFilters;
  onChange: (next: ControlTowerQueryFilters) => void;
  drivers: Array<{ id: string; name: string }>;
  onRefresh: () => void;
  refreshing: boolean;
  transport: 'sse' | 'poll';
};

const PRESETS: { value: ControlTowerPreset; labelKey: string }[] = [
  { value: 'all', labelKey: 'controlTower.preset.all' },
  { value: 'today', labelKey: 'controlTower.preset.today' },
  { value: 'week', labelKey: 'controlTower.preset.week' },
  { value: 'month', labelKey: 'controlTower.preset.month' },
];

export function ControlTowerFiltersBar({
  value,
  onChange,
  drivers,
  onRefresh,
  refreshing,
  transport,
}: Props) {
  const { t } = useTranslation();
  const preset = value.preset ?? 'all';

  const setPreset = (p: ControlTowerPreset) => {
    onChange({ ...value, preset: p });
  };

  const setDriver = (v: string | null) =>
    onChange({
      ...value,
      driverId: v && v !== '__all__' ? v : undefined,
    });

  const setTopLimit = (raw: string) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      onChange({ ...value, topLimit: undefined });
      return;
    }
    const clamped = Math.min(200, Math.max(1, n));
    onChange({ ...value, topLimit: clamped });
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>{t('controlTower.filters.preset')}</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as ControlTowerPreset)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('controlTower.filters.driver')}</Label>
          <Select
            value={value.driverId ?? '__all__'}
            onValueChange={setDriver}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('controlTower.filters.allDrivers')}</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ct-top">{t('controlTower.filters.topLimit')}</Label>
          <Input
            id="ct-top"
            type="number"
            min={1}
            max={200}
            className="w-[120px]"
            value={value.topLimit ?? 50}
            onChange={(e) => setTopLimit(e.target.value)}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
            aria-hidden
          />
          {t('controlTower.filters.refresh')}
        </Button>

        <span className="ms-auto text-xs text-muted-foreground">
          {transport === 'sse' ? t('controlTower.transport.sse') : t('controlTower.transport.poll')}
        </span>
      </div>
    </div>
  );
}
