import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import {
  fetchCashIntelligenceDashboard,
  fetchDriverOversight,
  type CashIntelDashboardResponse,
  type DriverOversightCard,
} from '@/api/manager';
import { useAuth } from '@/auth/auth-context';

const POLL_MS = 60_000;

export function useManagerOversight() {
  const { getValidAccessToken } = useAuth();
  const [rows, setRows] = useState<DriverOversightCard[]>([]);
  const [dashboard, setDashboard] =
    useState<CashIntelDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setLoading(true);
      }
      try {
        const token = await getValidAccessToken();
        if (!token) {
          throw new Error('انتهت الجلسة');
        }
        const [oversight, ssot] = await Promise.all([
          fetchDriverOversight(token),
          fetchCashIntelligenceDashboard(token),
        ]);
        setRows(oversight);
        setDashboard(ssot);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'فشل التحميل');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getValidAccessToken],
  );

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load({ silent: true }), POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void load({ silent: true });
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [load]);

  const cashByDriverId = useMemo(() => {
    const map = new Map<string, string>();
    if (dashboard) {
      for (const driver of dashboard.drivers) {
        map.set(driver.driverId, driver.totalCash);
      }
    }
    return map;
  }, [dashboard]);

  const totals = useMemo(() => {
    let ordersToday = 0;
    let atRisk = 0;
    for (const row of rows) {
      ordersToday += row.ordersTodayCount;
      if (row.atRisk) {
        atRisk += 1;
      }
    }
    return { ordersToday, atRisk, driverCount: rows.length };
  }, [rows]);

  return {
    rows,
    dashboard,
    cashByDriverId,
    totals,
    loading,
    refreshing,
    error,
    refresh: () => {
      setRefreshing(true);
      void load({ silent: true });
    },
    reload: () => void load(),
  };
}
