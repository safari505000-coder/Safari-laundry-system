import { useCallback, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import {
  blockCustomer,
  unblockCustomer,
  type CustomerBlockSnapshot,
} from '../api/cc-dashboard-api';

export type BlockingActionResult =
  | { ok: true; data: CustomerBlockSnapshot }
  | { ok: false; error: string };

/**
 * Block / unblock mutation pair. Both endpoints are idempotent on
 * the backend, so the UI can fire the call without checking current
 * state — but we still keep a `submitting` flag so the confirm
 * dialog can disable its primary action and the customer header pill
 * can render an inline spinner.
 */
export function useCcCustomerBlocking() {
  const { token } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const block = useCallback(
    async (customerId: string, reason: string): Promise<BlockingActionResult> => {
      if (!token) return { ok: false, error: 'انتهت الجلسة.' };
      setSubmitting(true);
      try {
        const data = await blockCustomer(token, customerId, { reason });
        return { ok: true, data };
      } catch (e) {
        return {
          ok: false,
          error:
            e instanceof ApiError ? e.message : 'تعذّر حظر العميل',
        };
      } finally {
        setSubmitting(false);
      }
    },
    [token],
  );

  const unblock = useCallback(
    async (
      customerId: string,
      reason?: string,
    ): Promise<BlockingActionResult> => {
      if (!token) return { ok: false, error: 'انتهت الجلسة.' };
      setSubmitting(true);
      try {
        const payload = reason && reason.trim().length > 0 ? { reason } : {};
        const data = await unblockCustomer(token, customerId, payload);
        return { ok: true, data };
      } catch (e) {
        return {
          ok: false,
          error:
            e instanceof ApiError ? e.message : 'تعذّر إلغاء حظر العميل',
        };
      } finally {
        setSubmitting(false);
      }
    },
    [token],
  );

  return { block, unblock, submitting };
}
