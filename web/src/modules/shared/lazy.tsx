import * as React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * V23 Phase 6 — Lazy route helper.
 *
 * Tiny utility for `React.lazy()` + a unified Suspense fallback that
 * matches the rest of Safari's loading visuals. Designed for one
 * thing only: shrinking the initial JS bundle by deferring the
 * heavy "rarely-used" pages (print views, reports hubs, inventory
 * back-office) until an operator actually navigates to them.
 *
 * Usage:
 *
 *   const InvoicePrintPage = lazyPage(
 *     () => import('@/pages/invoice-print-page'),
 *     'InvoicePrintPage',
 *   );
 *
 * For default exports, omit the `exportName`:
 *
 *   const Page = lazyPage(() => import('@/pages/some-page'));
 *
 * STRICT INVARIANTS:
 *   • The fallback MUST NOT block financial calls — it is a UI hint
 *     while the lazy chunk is being fetched.
 *   • The fallback MUST be small and ARIA-friendly so screen readers
 *     announce the loading state.
 */

type AnyComponent = React.ComponentType<Record<string, unknown>>;

export function lazyPage<P extends object>(
  loader: () => Promise<Record<string, unknown> & { default?: React.ComponentType<P> }>,
  exportName?: string,
): React.LazyExoticComponent<React.ComponentType<P>> {
  return React.lazy(async () => {
    const mod = await loader();
    if (!exportName) {
      const def = (mod as { default?: React.ComponentType<P> }).default;
      if (!def) {
        throw new Error('lazyPage: module has no default export');
      }
      return { default: def };
    }
    const cmp = (mod as Record<string, AnyComponent>)[exportName] as
      | React.ComponentType<P>
      | undefined;
    if (!cmp) {
      throw new Error(`lazyPage: module export "${exportName}" not found`);
    }
    return { default: cmp };
  });
}

export const RouteSuspenseFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="جاري تحميل الصفحة"
    className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground"
  >
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    <span>جاري التحميل…</span>
  </div>
);
