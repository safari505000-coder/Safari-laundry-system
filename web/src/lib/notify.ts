import { toast } from 'sonner';
import { ApiError } from '@/lib/api';

/**
 * Stage-F — unified toast notifications.
 *
 * Every page that calls the API repeated the same two-line pattern:
 *
 *     catch (e) {
 *       if (e instanceof ApiError) toast.error(e.message);
 *     }
 *
 * That silently swallowed `Error` instances (broken network, JSON
 * parse failure, etc.) and made it impossible to apply a consistent
 * look or action button across the app. `notify.error` fixes that by
 * extracting a human message from any caught value and funnelling
 * every toast through a single call site.
 *
 * Use the helpers from this module instead of importing `toast`
 * directly, *unless* you genuinely need one of sonner's more exotic
 * variants (promise, custom JSX, etc.).
 */

type ToastOptions = {
  description?: string;
  /** Optional action — `{ label, onClick }`. */
  action?: { label: string; onClick: () => void };
  /** Override the default visibility duration (ms). */
  duration?: number;
  /** Stable ID to deduplicate or replace in-flight toasts. */
  id?: string | number;
};

function describe(options?: ToastOptions) {
  if (!options) return undefined;
  const out: Record<string, unknown> = {};
  if (options.description) out.description = options.description;
  if (options.action) {
    out.action = {
      label: options.action.label,
      onClick: options.action.onClick,
    };
  }
  if (options.duration != null) out.duration = options.duration;
  if (options.id != null) out.id = options.id;
  return out;
}

/**
 * Extract a presentable message from any caught value.
 *
 * Priority:
 *   1. ApiError → `.message` plus status/errorCode suffix when useful.
 *   2. Standard Error → `.message`.
 *   3. String → as-is.
 *   4. Anything else → a generic fallback.
 */
export function extractErrorMessage(err: unknown, fallback = 'تعذّر تنفيذ العملية'): string {
  if (err instanceof ApiError) {
    return err.message || fallback;
  }
  if (err instanceof Error) {
    return err.message || fallback;
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err;
  }
  return fallback;
}

export const notify = {
  success(message: string, options?: ToastOptions) {
    toast.success(message, describe(options));
  },
  error(err: unknown, options?: ToastOptions & { fallback?: string }) {
    const msg = extractErrorMessage(err, options?.fallback);
    toast.error(msg, describe(options));
  },
  info(message: string, options?: ToastOptions) {
    toast.info(message, describe(options));
  },
  warning(message: string, options?: ToastOptions) {
    toast.warning(message, describe(options));
  },
  /**
   * Wrap an async operation with automatic loading / success / error
   * toasts. Swallows the error after notifying so call-sites that
   * don't need the resolved value can call this without a try/catch.
   */
  async promise<T>(
    work: Promise<T> | (() => Promise<T>),
    messages: {
      loading: string;
      success: string | ((value: T) => string);
      error?: string | ((err: unknown) => string);
    },
  ): Promise<T | undefined> {
    const p = typeof work === 'function' ? work() : work;
    try {
      toast.promise(p, {
        loading: messages.loading,
        success: messages.success,
        error: (err) =>
          typeof messages.error === 'function'
            ? messages.error(err)
            : (messages.error ?? extractErrorMessage(err)),
      });
      return await p;
    } catch {
      return undefined;
    }
  },
};
