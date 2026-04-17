import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/modules/shared/components/ui/button';

type Props = { children: ReactNode };

type State = { hasError: boolean; error: Error | null };

function ErrorFallback({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-lg font-semibold text-foreground">
        {t('errors.boundaryTitle')}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('errors.boundaryBody')}
      </p>
      {import.meta.env.DEV && error?.message ?
        <pre className="max-h-32 max-w-full overflow-auto rounded-md bg-muted p-3 text-start text-xs text-muted-foreground">
          {error.message}
        </pre>
      : null}
      <Button type="button" onClick={onRetry} className="min-h-11 min-w-[120px]">
        {t('errors.retry')}
      </Button>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={() => {
            this.setState({ hasError: false, error: null });
            window.location.reload();
          }}
        />
      );
    }
    return this.props.children;
  }
}

