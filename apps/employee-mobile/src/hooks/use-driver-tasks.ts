import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  acknowledgeDriverDispatch,
  pollDriverDispatches,
  type DriverDispatchTask,
} from '@/api/dispatch';
import { useAuth } from '@/auth/auth-context';

const POLL_MS = 10_000;

export type UseDriverTasksResult = {
  tasks: DriverDispatchTask[];
  hasAssignedAlert: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdatedIso: string | null;
  refresh: () => Promise<void>;
  acknowledgeDispatch: (taskId: string) => Promise<void>;
  acknowledgingId: string | null;
};

export function useDriverTasks(): UseDriverTasksResult {
  const { getValidAccessToken } = useAuth();
  const [tasks, setTasks] = useState<DriverDispatchTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedIso, setLastUpdatedIso] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const ackInFlightRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current != null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const fetchTasks = useCallback(
    async (mode: 'initial' | 'poll' | 'manual') => {
      if (inFlightRef.current) {
        return;
      }
      if (appStateRef.current !== 'active' && mode === 'poll') {
        return;
      }

      inFlightRef.current = true;
      const isFirstLoad = !initializedRef.current && mode === 'initial';

      try {
        if (isFirstLoad) {
          setLoading(true);
        }
        if (mode === 'manual') {
          setRefreshing(true);
        }

        const token = await getValidAccessToken();
        if (!token) {
          setError('انتهت الجلسة. سجّل الدخول مرة أخرى.');
          setTasks([]);
          return;
        }

        const nextTasks = await pollDriverDispatches(token);

        if (!initializedRef.current) {
          for (const task of nextTasks) {
            seenIdsRef.current.add(task.id);
          }
          initializedRef.current = true;
        }

        setTasks(nextTasks);
        setLastUpdatedIso(new Date().toISOString());
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'فشل تحميل المهام',
        );
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getValidAccessToken],
  );

  const refresh = useCallback(async () => {
    await fetchTasks('manual');
  }, [fetchTasks]);

  const acknowledgeDispatch = useCallback(
    async (taskId: string) => {
      if (ackInFlightRef.current) {
        return;
      }
      ackInFlightRef.current = true;
      setAcknowledgingId(taskId);
      try {
        const token = await getValidAccessToken();
        if (!token) {
          throw new Error('انتهت الجلسة');
        }
        const acknowledged = await acknowledgeDriverDispatch(token, taskId);
        setTasks((prev) =>
          prev.map((task) => (task.id === taskId ? acknowledged : task)),
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'فشل استلام المهمة',
        );
      } finally {
        ackInFlightRef.current = false;
        setAcknowledgingId(null);
      }
    },
    [getValidAccessToken],
  );

  useEffect(() => {
    initializedRef.current = false;
    seenIdsRef.current = new Set();
    void fetchTasks('initial');

    pollTimerRef.current = setInterval(() => {
      void fetchTasks('poll');
    }, POLL_MS);

    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        void fetchTasks('poll');
        if (pollTimerRef.current == null) {
          pollTimerRef.current = setInterval(() => {
            void fetchTasks('poll');
          }, POLL_MS);
        }
      } else {
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      sub.remove();
    };
  }, [fetchTasks, stopPolling]);

  return {
    tasks,
    hasAssignedAlert: tasks.some((task) => task.status === 'ASSIGNED'),
    loading,
    refreshing,
    error,
    lastUpdatedIso,
    refresh,
    acknowledgeDispatch,
    acknowledgingId,
  };
}
