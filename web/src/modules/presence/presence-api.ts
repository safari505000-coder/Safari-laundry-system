import { apiJson } from '@/lib/api';
import type {
  PresenceHeartbeat,
  PresenceListResponse,
  PresenceScopeKind,
} from './types';

/**
 * V23 Phase 6 — Presence API client.
 *
 * Tiny typed surface around the visibility-only `/api/presence/*`
 * endpoints. Importers should go through `useOperatorPresence` /
 * `useCustomerCoviewers` instead of calling these directly so the
 * heartbeat lifecycle remains centralized.
 */

export async function postPresenceHeartbeat(
  token: string,
  body: { scopeKind: PresenceScopeKind; scopeId: string },
): Promise<PresenceHeartbeat> {
  return apiJson<PresenceHeartbeat>('/api/presence/heartbeat', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function deletePresenceHeartbeat(
  token: string,
  body: { scopeKind: PresenceScopeKind; scopeId: string },
): Promise<{ released: boolean }> {
  return apiJson<{ released: boolean }>('/api/presence/heartbeat', {
    method: 'DELETE',
    token,
    body: JSON.stringify(body),
  });
}

export async function getCustomerCoviewers(
  token: string,
  customerId: string,
): Promise<PresenceListResponse> {
  return apiJson<PresenceListResponse>(
    `/api/presence/customer/${encodeURIComponent(customerId)}`,
    { token },
  );
}

export async function getActiveOperators(
  token: string,
): Promise<PresenceListResponse> {
  return apiJson<PresenceListResponse>('/api/presence/active', { token });
}
