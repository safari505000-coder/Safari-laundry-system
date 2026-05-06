import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { apiFetch } from '@/lib/api';

export type DriverTaskSeverity = 'ON_TIME' | 'LATE' | 'CRITICAL' | 'COMPLETED';
export type DriverTaskStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type DriverTaskSlaTone = 'NORMAL' | 'LATE' | 'BREACH';

export type DriverTask = {
  id: string;
  status: DriverTaskStatus;
  severity: DriverTaskSeverity;
  elapsedMinutes: number;
  customerId: string;
  customerDisplay: string;
  customerPhone: string | null;
  customerAddress?: string | null;
  address?: string | null;
  driverId: string;
  driverName: string;
  instructionNote: string | null;
  createdAtIso: string;
  acknowledgedAtIso?: string | null;
  completedAtIso: string | null;
  completedByOrderId: string | null;
  slaTone?: DriverTaskSlaTone;
};

type DriverTaskSnapshot = {
  generatedAtIso: string;
  rows: DriverTask[];
};

const POLL_MS = 5_000;

let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    sharedAudioContext ??= new Ctor();
    return sharedAudioContext;
  } catch {
    return null;
  }
}

function playFallbackTone(): void {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.18);
  } catch {
    // autoplay / suspended
  }
}

function playDispatchSound(): void {
  try {
    const el = new Audio('/sounds/dispatch.mp3');
    void el.play().catch(() => {
      playFallbackTone();
    });
  } catch {
    playFallbackTone();
  }
}

function parseDriverTask(data: unknown): DriverTask | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.status !== 'string') return null;
  return row as unknown as DriverTask;
}

/** Polling fallback — same snapshot shape as SSE payloads (`DispatchRowDto`). */
export async function subscribeDriverTasksPoll(
  token: string,
  signal: AbortSignal,
): Promise<DriverTask[]> {
  const snapshot = await apiFetch<DriverTaskSnapshot>(
    '/api/driver/dispatch/mine/poll',
    { token, signal },
  );
  const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
  return rows.filter((r) => r.status === 'ASSIGNED');
}

export type UseDriverTasksResult = {
  tasks: DriverTask[];
  hasAssignedAlert: boolean;
  loading: boolean;
  error: string | null;
  transport: 'sse' | 'poll';
  markSeen: (taskId?: string) => void;
  acknowledgeDispatch: (taskId: string) => Promise<void>;
  acknowledgingId: string | null;
};

export function useDriverTasks(): UseDriverTasksResult {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<DriverTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transport, setTransport] = useState<'sse' | 'poll'>('sse');
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const ackInFlightRef = useRef(false);
  const playedRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const latestTasksRef = useRef<DriverTask[]>([]);
  const sseFailedRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(
    null,
  );

  const markSeen = useCallback((taskId?: string) => {
    void taskId;
  }, []);

  useEffect(() => {
    if (!('Notification' in window)) return;
    void Notification.requestPermission().catch(() => {});
  }, []);

  useEffect(() => {
    const resumeAudio = () => {
      const ctx = getSharedAudioContext();
      if (ctx?.state === 'suspended') void ctx.resume();
    };
    window.addEventListener('click', resumeAudio, { once: true });
    window.addEventListener('touchstart', resumeAudio, { once: true });
    window.addEventListener('keydown', resumeAudio, { once: true });
    return () => {
      window.removeEventListener('click', resumeAudio);
      window.removeEventListener('touchstart', resumeAudio);
      window.removeEventListener('keydown', resumeAudio);
    };
  }, []);

  const notifyNewTasks = useCallback((newTasks: DriverTask[]) => {
    if (newTasks.length === 0) return;
    playDispatchSound();

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }

    if (
      document.hidden &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new Notification('🚨 مهمة جديدة', {
        body: 'تم إسناد مهمة لك',
      });
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current != null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const applyServerRow = useCallback((row: DriverTask, allowSound: boolean) => {
    if (row.status === 'ASSIGNED') {
      if (allowSound && !playedRef.current.has(row.id)) {
        playedRef.current.add(row.id);
        notifyNewTasks([row]);
      }
      setTasks((prev) => {
        const others = prev.filter((t) => t.id !== row.id);
        const next = [row, ...others];
        latestTasksRef.current = next;
        return next;
      });
    } else {
      setTasks((prev) => {
        const next = prev.filter((t) => t.id !== row.id);
        latestTasksRef.current = next;
        return next;
      });
    }
  }, [notifyNewTasks]);

  const pollOnce = useCallback(async () => {
    if (
      !token ||
      inFlightRef.current ||
      document.visibilityState === 'hidden'
    ) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;

    const isFirstHydration = !initializedRef.current;

    try {
      if (isFirstHydration) setLoading(true);

      const nextTasks = await subscribeDriverTasksPoll(
        token,
        controller.signal,
      );

      if (!initializedRef.current) {
        for (const t of nextTasks) {
          playedRef.current.add(t.id);
        }
        initializedRef.current = true;
        latestTasksRef.current = nextTasks;
        setTasks(nextTasks);
        setError(null);
        return;
      }

      const newTasks = nextTasks.filter((t) => !playedRef.current.has(t.id));
      for (const t of newTasks) {
        playedRef.current.add(t.id);
      }
      if (newTasks.length > 0) {
        notifyNewTasks(newTasks);
      }

      latestTasksRef.current = nextTasks;
      setTasks(nextTasks);
      setError(null);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError('فشل تحميل المهام');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [notifyNewTasks, token]);

  const acknowledgeDispatch = useCallback(
    async (taskId: string) => {
      if (!token || ackInFlightRef.current) return;
      ackInFlightRef.current = true;
      setAcknowledgingId(taskId);
      try {
        await apiFetch<DriverTask>(
          `/api/driver/dispatch/${taskId}/acknowledge`,
          { method: 'POST', token },
        );

        setTasks((prev) => {
          const next = prev.filter((t) => t.id !== taskId);
          latestTasksRef.current = next;
          return next;
        });
        toast.success('تم استلام المهمة');
      } catch {
        toast.error('فشل استلام المهمة');
      } finally {
        ackInFlightRef.current = false;
        setAcknowledgingId(null);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      initializedRef.current = false;
      playedRef.current = new Set();
      latestTasksRef.current = [];
      sseFailedRef.current = false;
      setTasks([]);
      setError(null);
      setLoading(false);
      setTransport('sse');
      stopPolling();
      abortRef.current?.abort();
      abortRef.current = null;
      inFlightRef.current = false;
      return;
    }

    initializedRef.current = false;
    playedRef.current = new Set();
    sseFailedRef.current = false;
    setLoading(true);
    setTransport('sse');

    let es: EventSource | null = null;

    const startPollFallback = () => {
      sseFailedRef.current = true;
      setTransport('poll');
      stopPolling();
      if (document.visibilityState === 'hidden') return;
      void pollOnce();
      pollTimerRef.current = window.setInterval(() => {
        void pollOnce();
      }, POLL_MS);
    };

    const attachSse = () => {
      try {
        const url = `/api/driver/dispatch/stream?access_token=${encodeURIComponent(token)}`;
        es = new EventSource(url);
        es.onopen = () => {
          sseFailedRef.current = false;
          setTransport('sse');
          stopPolling();
        };

        const onPayload = (ev: MessageEvent, soundForNew: boolean) => {
          const parsed =
            typeof ev.data === 'string'
              ? parseDriverTask(JSON.parse(ev.data))
              : parseDriverTask(ev.data);
          if (!parsed) return;
          applyServerRow(parsed, soundForNew);
        };

        es.addEventListener('dispatch:new', (ev) => onPayload(ev, true));
        es.addEventListener('dispatch:update', (ev) => onPayload(ev, false));
        es.addEventListener('dispatch:alert', (ev) => onPayload(ev, false));

        es.onerror = () => {
          es?.close();
          es = null;
          startPollFallback();
        };
      } catch {
        startPollFallback();
      }
    };

    void pollOnce();
    attachSse();

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        if (sseFailedRef.current && pollTimerRef.current == null) {
          void pollOnce();
          pollTimerRef.current = window.setInterval(() => {
            void pollOnce();
          }, POLL_MS);
        }
      } else {
        stopPolling();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
      es?.close();
      stopPolling();
      abortRef.current?.abort();
      abortRef.current = null;
      inFlightRef.current = false;
    };
  }, [applyServerRow, pollOnce, stopPolling, token]);

  const hasAssignedAlert = tasks.some((t) => t.status === 'ASSIGNED');

  return {
    tasks,
    hasAssignedAlert,
    loading,
    error,
    transport,
    markSeen,
    acknowledgeDispatch,
    acknowledgingId,
  };
}
