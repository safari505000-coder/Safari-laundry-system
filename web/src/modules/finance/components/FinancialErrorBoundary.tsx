import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

/**
 * V20.7 — Phase 3 / 8 FinancialErrorBoundary.
 *
 * Wraps a financial surface so an unexpected render error never
 * pulls down the surrounding workspace. Designed to render an
 * actionable fallback (with retry) instead of the React white
 * screen.
 *
 * Use ONE per top-level financial route / panel — not one per
 * component.
 */

export type FinancialErrorBoundaryProps = {
  children: ReactNode;
  /** Optional override for the fallback render. */
  fallback?: (err: Error, retry: () => void) => ReactNode;
  /** Reported to the host so parent surfaces can log + invalidate. */
  onError?: (err: Error, info: ErrorInfo) => void;
};

type State = { error: Error | null };

export class FinancialErrorBoundary extends Component<
  FinancialErrorBoundaryProps,
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
    // Always log so an unexpected error in production is visible in
    // browser devtools / Sentry.
    // eslint-disable-next-line no-console
    console.error('[FinancialErrorBoundary]', error, info.componentStack);
  }

  retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.retry);
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
      >
        <h4 className="text-sm font-bold">Financial surface failed to render.</h4>
        <p className="mt-1 text-xs opacity-80">{this.state.error.message}</p>
        <button
          type="button"
          onClick={this.retry}
          className="mt-2 inline-flex items-center rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700"
        >
          Retry
        </button>
      </div>
    );
  }
}
