import { apiJson } from '@/lib/api';
import type {
  CreateWorkflowItemInput,
  WorkflowItem,
  WorkflowKind,
  WorkflowQueueSnapshot,
  WorkflowStatus,
} from './types';

/**
 * V23.1 Phase 7 — Collections Workflow API client.
 *
 * Tiny typed surface around the visibility-only
 * `/api/collections/workflow/*` endpoints. Importers should go
 * through `useCollectionsWorkflow` instead of calling these
 * directly so the queue refresh lifecycle remains centralized.
 */

export interface ListWorkflowItemsQuery {
  customerId?: string;
  branchId?: string;
  kind?: WorkflowKind;
  status?: WorkflowStatus;
  scheduledBeforeIso?: string;
  scheduledAfterIso?: string;
}

function buildQuery(query: Record<string, string | undefined>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== '') out.set(k, v);
  }
  const s = out.toString();
  return s.length > 0 ? `?${s}` : '';
}

export async function listWorkflowItems(
  token: string,
  query: ListWorkflowItemsQuery = {},
): Promise<WorkflowItem[]> {
  return apiJson<WorkflowItem[]>(
    `/api/collections/workflow${buildQuery(query as Record<string, string | undefined>)}`,
    { token },
  );
}

export async function getWorkflowQueueSnapshot(
  token: string,
  query: { branchId?: string } = {},
): Promise<WorkflowQueueSnapshot> {
  return apiJson<WorkflowQueueSnapshot>(
    `/api/collections/workflow/queue${buildQuery(query as Record<string, string | undefined>)}`,
    { token },
  );
}

export async function getWorkflowItem(
  token: string,
  id: string,
): Promise<WorkflowItem> {
  return apiJson<WorkflowItem>(`/api/collections/workflow/${encodeURIComponent(id)}`, {
    token,
  });
}

export async function createWorkflowItem(
  token: string,
  body: CreateWorkflowItemInput,
): Promise<WorkflowItem> {
  return apiJson<WorkflowItem>('/api/collections/workflow', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function transitionWorkflowItem(
  token: string,
  id: string,
  body: { nextStatus: WorkflowStatus; notes?: string },
): Promise<WorkflowItem> {
  return apiJson<WorkflowItem>(
    `/api/collections/workflow/${encodeURIComponent(id)}/transition`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    },
  );
}

export async function claimWorkflowItem(
  token: string,
  id: string,
  body: { release?: boolean } = {},
): Promise<WorkflowItem> {
  return apiJson<WorkflowItem>(
    `/api/collections/workflow/${encodeURIComponent(id)}/claim`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    },
  );
}
