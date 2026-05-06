import { useCallback, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import {
  createDispatch,
  reassignDispatch,
  type CreateDispatchInput,
  type DispatchRow,
  type ReassignDispatchInput,
} from '../api/cc-dashboard-api';

export type DispatchActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number; errorCode?: string };

/**
 * Mutation helpers for dispatch create + reassign.
 *
 * Both methods return a discriminated `DispatchActionResult` so the
 * caller can branch on success/failure without try/catch noise. The
 * `submitting` flag is shared across both calls — fine for the UI
 * because the dispatch tab disables both action buttons during any
 * active mutation.
 *
 * Errors of interest the UI should surface:
 *   - 403 CUSTOMER_BLOCKED  → "العميل محظور — لا يمكن إصدار مهمة"
 *   - 404 DISPATCH_NOT_FOUND
 *   - 400 DRIVER_UNCHANGED
 *   - 404 DRIVER_NOT_FOUND
 *   - 400 DRIVER_ROLE_MISMATCH
 */
export function useCcDispatchActions() {
  const { token } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const create = useCallback(
    async (
      input: CreateDispatchInput,
    ): Promise<DispatchActionResult<DispatchRow>> => {
      if (!token) {
        return { ok: false, error: 'انتهت الجلسة. سجّل الدخول من جديد.' };
      }
      setSubmitting(true);
      try {
        const data = await createDispatch(token, input);
        return { ok: true, data };
      } catch (e) {
        if (e instanceof ApiError) {
          return {
            ok: false,
            error: e.message,
            status: e.status,
            errorCode: e.errorCode,
          };
        }
        return { ok: false, error: 'تعذّر إنشاء المهمة' };
      } finally {
        setSubmitting(false);
      }
    },
    [token],
  );

  const reassign = useCallback(
    async (
      dispatchId: string,
      input: ReassignDispatchInput,
    ): Promise<DispatchActionResult<DispatchRow>> => {
      if (!token) {
        return { ok: false, error: 'انتهت الجلسة. سجّل الدخول من جديد.' };
      }
      setSubmitting(true);
      try {
        const data = await reassignDispatch(token, dispatchId, input);
        return { ok: true, data };
      } catch (e) {
        if (e instanceof ApiError) {
          return {
            ok: false,
            error: e.message,
            status: e.status,
            errorCode: e.errorCode,
          };
        }
        return { ok: false, error: 'تعذّر إعادة إسناد المهمة' };
      } finally {
        setSubmitting(false);
      }
    },
    [token],
  );

  return { create, reassign, submitting };
}
