import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  claimWorkflowItem,
  createWorkflowItem,
  getWorkflowQueueSnapshot,
  transitionWorkflowItem,
} from './collections-workflow-api';
import type {
  CreateWorkflowItemInput,
  WorkflowItem,
  WorkflowQueueSnapshot,
  WorkflowStatus,
} from './types';

/**
 * V23.1 Phase 7 — Collections Workflow lifecycle hook.
 *
 * Owns:
 *   • Initial fetch + periodic refresh of the 3-laned queue snapshot
 *   • create / transition / claim mutations with optimistic UI nudge
 *     (the underlying refetch is the source of truth)
 *
 * STRICT INVARIANTS:
 *   • The hook NEVER stores a financial value in local state. Every
 *     `amountKdSnapshot` is rendered verbatim from the API response.
 *   • Mutations call the canonical `/api/collections/workflow/*`
 *     endpoints — there is no local fallback storage.
 *   • Refresh is debounced via `inflight` flag so a burst of realtime
 *     events cannot cause a render storm.
 */

const REFRESH_MS = 12_000;

export interface UseCollectionsWorkflowOptions {
  branchId?: string | null;
  /** Disable the hook (e.g. background tab). */
  enabled?: boolean;
  /** Override poll interval in ms. */
  pollMs?: number;
}

export interface UseCollectionsWorkflowResult {
  snapshot: WorkflowQueueSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: CreateWorkflowItemInput) => Promise<WorkflowItem>;
  transition: (id: string, nextStatus: WorkflowStatus, notes?: string) => Promise<WorkflowItem>;
  claim: (id: string, release?: boolean) => Promise<WorkflowItem>;
}

export function useCollectionsWorkflow(
  opts: UseCollectionsWorkflowOptions = {},
): UseCollectionsWorkflowResult {
  const { token } = useAuth();
  const enabled = opts.enabled !== false && Boolean(token);
  const pollMs = opts.pollMs ?? REFRESH_MS;

  const [snapshot, setSnapshot] = useState<WorkflowQueueSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inflight = useRef(false);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || !token) return;
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    try {
      const next = await getWorkflowQueueSnapshot(token, {
        branchId: opts.branchId ?? undefined,
      });
      if (cancelledRef.current) return;
      setSnapshot(next);
      setError(null);
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : 'workflow_fetch_failed');
    } finally {
      inflight.current = false;
      if (!cancelledRef.current) setLoading(false);
    }
  }, [enabled, token, opts.branchId]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled) return;
    void refresh();
    const id = window.setInterval(refresh, pollMs);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(id);
    };
  }, [enabled, refresh, pollMs]);

  const create = useCallback<UseCollectionsWorkflowResult['create']>(
    async (input) => {
      if (!token) throw new Error('not_authenticated');
      const item = await createWorkflowItem(token, input);
      void refresh();
      return item;
    },
    [token, refresh],
  );

  const transition = useCallback<UseCollectionsWorkflowResult['transition']>(
    async (id, nextStatus, notes) => {
      if (!token) throw new Error('not_authenticated');
      const item = await transitionWorkflowItem(token, id, { nextStatus, notes });
      void refresh();
      return item;
    },
    [token, refresh],
  );

  const claim = useCallback<UseCollectionsWorkflowResult['claim']>(
    async (id, release) => {
      if (!token) throw new Error('not_authenticated');
      const item = await claimWorkflowItem(token, id, { release });
      void refresh();
      return item;
    },
    [token, refresh],
  );

  return { snapshot, loading, error, refresh, create, transition, claim };
}
