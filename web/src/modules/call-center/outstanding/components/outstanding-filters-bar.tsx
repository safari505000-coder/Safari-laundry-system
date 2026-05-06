import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, RefreshCw, Search, X } from 'lucide-react';
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
  CustomerCollectionStatusKind,
  OutstandingFilters,
} from '../api/outstanding-api';

type Props = {
  filters: OutstandingFilters;
  onChange: (next: OutstandingFilters) => void;
  drivers?: Array<{ id: string; name: string }>;
  onRefresh: () => void;
  refreshing: boolean;
};

const STATUS_OPTIONS: Array<{
  value: '' | CustomerCollectionStatusKind;
  labelKey: string;
  fallback: string;
}> = [
  { value: '', labelKey: 'outstanding.status.any', fallback: 'كل الحالات' },
  { value: 'NORMAL', labelKey: 'outstanding.status.normal', fallback: 'عادي' },
  { value: 'LATE', labelKey: 'outstanding.status.late', fallback: 'متأخر' },
  { value: 'RISK', labelKey: 'outstanding.status.risk', fallback: 'خطر' },
];

const BLOCKED_OPTIONS: Array<{
  value: '' | 'true' | 'false';
  labelKey: string;
  fallback: string;
}> = [
  { value: '', labelKey: 'outstanding.blocked.any', fallback: 'الكل' },
  {
    value: 'true',
    labelKey: 'outstanding.blocked.only',
    fallback: 'المحظورون فقط',
  },
  {
    value: 'false',
    labelKey: 'outstanding.blocked.exclude',
    fallback: 'استبعاد المحظورين',
  },
];

/**
 * V19.x — Filter bar for the Outstanding Payments page. Pure controlled
 * component: every change propagates synchronously through `onChange`
 * except the search input, which is debounced 300ms before being
 * forwarded so a quick typist doesn't fire one fetch per keystroke.
 */
export function OutstandingFiltersBar({
  filters,
  onChange,
  drivers = [],
  onRefresh,
  refreshing,
}: Props) {
  const { t } = useTranslation();
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '');

  // Sync draft with external prop changes (e.g. clear button).
  useEffect(() => {
    setSearchDraft(filters.search ?? '');
  }, [filters.search]);

  // Debounce search.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((filters.search ?? '') !== searchDraft) {
        onChange({ ...filters, search: searchDraft || undefined });
      }
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const setFrom = (value: string) =>
    onChange({ ...filters, from: value || undefined });
  const setTo = (value: string) =>
    onChange({ ...filters, to: value || undefined });
  const setDriver = (value: string | null) =>
    onChange({ ...filters, driverId: value ? value : undefined });
  const setStatus = (value: string | null) =>
    onChange({
      ...filters,
      status: value ? (value as CustomerCollectionStatusKind) : undefined,
    });
  const setBlocked = (value: string | null) =>
    onChange({
      ...filters,
      blocked: value ? value === 'true' : undefined,
    });

  const clearAll = () =>
    onChange({
      from: undefined,
      to: undefined,
      driverId: undefined,
      status: undefined,
      blocked: undefined,
      search: undefined,
    });

  const isoDate = (iso?: string) => (iso ? iso.slice(0, 10) : '');

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="size-4" aria-hidden />
          {t('outstanding.filters.title', { defaultValue: 'تصفية' })}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            type="button"
          >
            <X className="size-4" aria-hidden />
            {t('outstanding.filters.clear', { defaultValue: 'مسح' })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            type="button"
          >
            <RefreshCw
              className={
                refreshing ? 'size-4 animate-spin' : 'size-4'
              }
              aria-hidden
            />
            {t('outstanding.filters.refresh', { defaultValue: 'تحديث' })}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ar-from" className="text-xs text-muted-foreground">
            {t('outstanding.filters.from', { defaultValue: 'من تاريخ' })}
          </Label>
          <Input
            id="ar-from"
            type="date"
            value={isoDate(filters.from)}
            onChange={(e) =>
              setFrom(e.target.value ? `${e.target.value}T00:00:00.000Z` : '')
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ar-to" className="text-xs text-muted-foreground">
            {t('outstanding.filters.to', { defaultValue: 'إلى تاريخ' })}
          </Label>
          <Input
            id="ar-to"
            type="date"
            value={isoDate(filters.to)}
            onChange={(e) =>
              setTo(e.target.value ? `${e.target.value}T23:59:59.999Z` : '')
            }
          />
        </div>

        {drivers.length > 0 && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">
              {t('outstanding.filters.driver', { defaultValue: 'السائق' })}
            </Label>
            <Select
              value={filters.driverId ?? ''}
              onValueChange={setDriver}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={t('outstanding.filters.allDrivers', {
                    defaultValue: 'كل السائقين',
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">
                  {t('outstanding.filters.allDrivers', {
                    defaultValue: 'كل السائقين',
                  })}
                </SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">
            {t('outstanding.filters.status', { defaultValue: 'الحالة' })}
          </Label>
          <Select
            value={filters.status ?? ''}
            onValueChange={setStatus}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={t('outstanding.status.any', {
                  defaultValue: 'كل الحالات',
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey, { defaultValue: opt.fallback })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">
            {t('outstanding.filters.blocked', { defaultValue: 'المحظورون' })}
          </Label>
          <Select
            value={
              typeof filters.blocked === 'boolean'
                ? filters.blocked
                  ? 'true'
                  : 'false'
                : ''
            }
            onValueChange={setBlocked}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={t('outstanding.blocked.any', {
                  defaultValue: 'الكل',
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {BLOCKED_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey, { defaultValue: opt.fallback })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="ar-search" className="text-xs text-muted-foreground">
            {t('outstanding.filters.search', { defaultValue: 'بحث' })}
          </Label>
          <div className="relative">
            <Search className="absolute end-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="ar-search"
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={t('outstanding.filters.searchPlaceholder', {
                defaultValue: 'اسم أو رقم الهاتف…',
              })}
              className="pe-8"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
