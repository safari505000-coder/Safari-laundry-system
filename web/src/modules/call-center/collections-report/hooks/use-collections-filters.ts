import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  presetToRange,
  type DatePreset,
  type DateRange,
} from '../utils/date-presets';
import type { OutstandingFilters } from '@/modules/call-center/outstanding/api/outstanding-api';

const DEBOUNCE_MS = 300;

export type CollectionsFilters = {
  preset: DatePreset;
  /** Manual date range. Only honoured when `preset === 'CUSTOM'`. */
  custom: DateRange;
  driverId: string;
  branchId: string;
  hasPaymentLink: boolean;
};

export const DEFAULT_COLLECTIONS_FILTERS: CollectionsFilters = {
  preset: 'MONTH',
  custom: { from: '', to: '' },
  driverId: '',
  branchId: '',
  hasPaymentLink: false,
};

export type UseCollectionsFiltersResult = {
  /** Live filter values bound to the inputs (no debounce). */
  filters: CollectionsFilters;
  /** Debounced filter values fed to the API hooks. */
  effective: CollectionsFilters;
  /** API-shape filters derived from `effective`, ready for `useOutstanding`. */
  apiFilters: OutstandingFilters;
  setPreset: (preset: DatePreset) => void;
  setCustomRange: (range: DateRange) => void;
  setDriverId: (id: string) => void;
  setBranchId: (id: string) => void;
  setHasPaymentLink: (v: boolean) => void;
  reset: () => void;
};

/**
 * Filter state for the Collections Report. Filters affect:
 *   1. The query forwarded to `/api/finance/outstanding` (server-side
 *      scoping — the API returns `totalDueKd` consistent with the
 *      filtered rows, preserving SSoT).
 *   2. The local UI selection (`hasPaymentLink` is a pure UI filter
 *      applied after the server response is received).
 *
 * IMPORTANT: We never recompute `totalDueKd` in the client. Whatever
 * the API returns for the active filter window is rendered verbatim.
 */
export function useCollectionsFilters(
  initial: Partial<CollectionsFilters> = {},
): UseCollectionsFiltersResult {
  const [filters, setFilters] = useState<CollectionsFilters>({
    ...DEFAULT_COLLECTIONS_FILTERS,
    ...initial,
  });
  const [effective, setEffective] = useState<CollectionsFilters>(
    () => ({ ...DEFAULT_COLLECTIONS_FILTERS, ...initial }),
  );
  const debounceRef = useRef<number | null>(null);

  // Debounce filter changes so rapid keystrokes / preset clicks don't
  // hammer the API. We mirror live state into `effective` after 300ms.
  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      setEffective(filters);
      debounceRef.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [filters]);

  const setPreset = useCallback((preset: DatePreset) => {
    setFilters((prev) => ({ ...prev, preset }));
  }, []);
  const setCustomRange = useCallback((range: DateRange) => {
    setFilters((prev) => ({ ...prev, custom: range, preset: 'CUSTOM' }));
  }, []);
  const setDriverId = useCallback((id: string) => {
    setFilters((prev) => ({ ...prev, driverId: id }));
  }, []);
  const setBranchId = useCallback((id: string) => {
    setFilters((prev) => ({ ...prev, branchId: id }));
  }, []);
  const setHasPaymentLink = useCallback((v: boolean) => {
    setFilters((prev) => ({ ...prev, hasPaymentLink: v }));
  }, []);
  const reset = useCallback(() => {
    setFilters({ ...DEFAULT_COLLECTIONS_FILTERS, ...initial });
  }, [initial]);

  const apiFilters = useMemo<OutstandingFilters>(() => {
    const range =
      effective.preset === 'CUSTOM'
        ? effective.custom
        : presetToRange(effective.preset);
    const out: OutstandingFilters = {};
    if (range && range.from) out.from = range.from;
    if (range && range.to) out.to = range.to;
    if (effective.driverId) out.driverId = effective.driverId;
    if (effective.branchId) out.branchId = effective.branchId;
    return out;
  }, [effective]);

  return {
    filters,
    effective,
    apiFilters,
    setPreset,
    setCustomRange,
    setDriverId,
    setBranchId,
    setHasPaymentLink,
    reset,
  };
}
