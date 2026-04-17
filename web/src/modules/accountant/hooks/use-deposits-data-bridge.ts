import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  getDeposits,
  updateDepositStatus,
  type DepositAuditRow,
  type DepositStatus,
} from '@/lib/api';

export function useDepositsDataBridge(token: string | null, enabled: boolean) {
  const [status, setStatus] = useState<DepositStatus | 'ALL'>('PENDING');
  const [driverName, setDriverName] = useState('');
  const [debouncedDriverName, setDebouncedDriverName] = useState('');
  const [rows, setRows] = useState<DepositAuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedDriverName(driverName.trim());
    }, 300);
    return () => window.clearTimeout(id);
  }, [driverName]);

  const load = useCallback(async () => {
    if (!token || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDeposits(token, {
        status: status === 'ALL' ? undefined : status,
        driverName: debouncedDriverName || undefined,
      });
      setRows(data.rows ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load deposits');
    } finally {
      setLoading(false);
    }
  }, [token, enabled, status, debouncedDriverName]);

  useEffect(() => {
    void load();
  }, [load]);

  const audit = useCallback(
    async (id: string, nextStatus: Exclude<DepositStatus, 'PENDING'>, auditComment?: string) => {
      if (!token || !enabled) return;
      await updateDepositStatus(token, id, { status: nextStatus, auditComment });
      await load();
    },
    [token, enabled, load],
  );

  return {
    status,
    setStatus,
    driverName,
    setDriverName,
    rows,
    loading,
    error,
    reload: load,
    audit,
  };
}
