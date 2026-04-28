/**
 * Replay queued POST bodies to Nest `/api/**` — same envelope as {@link apiJson}.
 */

import { ApiError, buildUrl } from '@/lib/api';
import {
  bumpMutationFailure,
  deletePendingMutation,
  listPendingFifo,
} from '@/offline/queue-ops';

function parseEnvelope(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function formatHttpError(status: number, json: Record<string, unknown>): string {
  const message = json.message;
  let raw = '';
  if (Array.isArray(message)) {
    raw = message.map(String).join(', ');
  } else if (typeof message === 'string' && message.length > 0) {
    raw = message;
  }
  const err = json.error;
  if (!raw && typeof err === 'string') {
    raw = err;
  }
  if (!raw || raw === '[object Object]') raw = `HTTP ${status}`;
  return raw;
}

/** Process pending mutations sequentially (FIFO); stops on first hard failure when online. */
export async function flushPendingMutations(
  bearerToken: string,
): Promise<{ processed: number; lastError?: string }> {
  let processed = 0;
  let lastError: string | undefined;
  const queue = await listPendingFifo();
  for (const row of queue) {
    try {
      const res = await fetch(buildUrl(row.path), {
        method: 'POST',
        body: row.payloadJson,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
      });
      const rawText = await res.text();
      const json = parseEnvelope(rawText);
      if (!res.ok) {
        throw new ApiError(formatHttpError(res.status, json), res.status);
      }
      if (json.data === undefined) {
        throw new ApiError('Invalid API response (missing data)', res.status);
      }
      await deletePendingMutation(row.id);
      processed += 1;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await bumpMutationFailure(row.id, msg);
      lastError = msg;
      break;
    }
  }
  return { processed, lastError };
}
