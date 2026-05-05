/**
 * Cash Intelligence consumer hook (executive-clean revision).
 *
 * The Branch Manager Dashboard was simplified into a 3-section,
 * decision-first surface. As part of that reduction we dropped every
 * widget that consumed `/live`, `/operational`, or `/decisions`, so
 * the hook no longer fetches them. We keep two endpoints:
 *
 *   - `/classified`  : SINGLE SOURCE OF TRUTH for systemStatus,
 *                       financial / compliance alerts, per-driver
 *                       status, AND per-driver cash amount. Drives
 *                       every visible piece of the new UI, including
 *                       the header "total cash in flight" figure
 *                       (which is computed as
 *                       `Σ classified.drivers[].amount`).
 *   - `/executive`   : kept around for `topRisk` and decision metadata
 *                       (priority, recommended steps, responsibility).
 *                       NOT used as a source for cash totals.
 *
 * Behaviour:
 *   - Auto-poll every 60 seconds.
 *   - Cancel any in-flight request before kicking the next poll.
 *   - One `console.debug` line per successful poll for traceability.
 *
 * STRICT: no money math beyond Σ over the classifier's per-driver
 * amounts, no severity decisions, no derived state. The UI consumes
 * the response verbatim.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  getCashIntelClassified,
  getCashIntelExecutive,
  type CashIntelClassifiedResponse,
  type CashIntelExecutiveResponse,
} from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';

const POLL_INTERVAL_MS = 60_000;

export type CashIntelligenceState = {
  loading: boolean;
  error: string | null;
  classified: CashIntelClassifiedResponse | null;
  executive: CashIntelExecutiveResponse | null;
  lastUpdatedAt: number | null;
  refresh: () => void;
};

export function useCashIntelligence(): CashIntelligenceState {
  const { token } = useAuth();
  const [classified, setClassified] =
    useState<CashIntelClassifiedResponse | null>(null);
  const [executive, setExecutive] =
    useState<CashIntelExecutiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const inflightRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const fetchAll = useCallback(async () => {
    if (!token) return;
    if (inflightRef.current) inflightRef.current.abort();
    const ac = new AbortController();
    inflightRef.current = ac;
    setError(null);

    try {
      const [classifiedRes, executiveRes] = await Promise.all([
        getCashIntelClassified(token, ac.signal),
        getCashIntelExecutive(token, ac.signal),
      ]);
      if (ac.signal.aborted) return;
      setClassified(classifiedRes);
      setExecutive(executiveRes);
      setLastUpdatedAt(Date.now());
      setLoading(false);

      // SSoT (strict-ledger): debug log carries STRUCTURAL counts only.
      // The total KD figure must come from `/api/finance/ledger/summary`
      // (BANK_ACCOUNT + DRIVER_* + MANAGER_* balances) — never from a
      // client-side `reduce(parseFloat(amount))`, which is what this
      // line used to do. ESLint enforces this at the syntax level.
      console.debug('[cash-intel]', {
        systemStatus: classifiedRes.systemStatus,
        financialAlerts: classifiedRes.financialAlerts.length,
        complianceAlerts: classifiedRes.complianceAlerts.length,
        drivers: classifiedRes.drivers.length,
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Failed to load cash intelligence.';
      setError(msg);
      setLoading(false);
    }
  }, [token]);

  // First fetch on mount / re-auth.
  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // 60-second poll.
  useEffect(() => {
    if (!token) return;
    pollTimerRef.current = window.setInterval(() => {
      void fetchAll();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, [token, fetchAll]);

  // Cancel in-flight on unmount.
  useEffect(() => {
    return () => {
      if (inflightRef.current) inflightRef.current.abort();
    };
  }, []);

  const refresh = useCallback(() => {
    void fetchAll();
  }, [fetchAll]);

  return useMemo(
    () => ({
      loading,
      error,
      classified,
      executive,
      lastUpdatedAt,
      refresh,
    }),
    [loading, error, classified, executive, lastUpdatedAt, refresh],
  );
}
