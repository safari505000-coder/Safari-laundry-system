import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useOfflineSync } from '@/offline/offline-sync-context';
import { Button } from '@/modules/shared/components/ui/button';

/** Sticky ribbons: offline notice + pending sync (authenticated only). */
export function OfflineGlobalAlerts() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { online, pendingCount, syncing, flushPendingQueue } = useOfflineSync();

  if (!token) {
    return null;
  }

  const showOffline = !online;
  const showPending = online && pendingCount > 0;

  if (!showOffline && !showPending) {
    return null;
  }

  return (
    <div
      className="print:pointer-events-none pointer-events-auto fixed start-3 end-3 z-[60] max-w-4xl sm:start-6 sm:end-6 md:start-auto md:end-8"
      style={{
        top: 'max(0.5rem, env(safe-area-inset-top, 0px))',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-2">
        {showOffline ?
          <div
            className={[
              'rounded-lg border px-4 py-2.5 text-sm shadow-md backdrop-blur supports-[backdrop-filter]:backdrop-blur-sm',
              'border-amber-300 bg-amber-50 text-amber-950',
              'dark:border-amber-800 dark:bg-amber-950/85 dark:text-amber-50',
            ].join(' ')}
          >
            {t('offline.bannerOffline')}
          </div>
        : null}

        {showPending ?
          <div
            className={[
              'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm shadow-md backdrop-blur supports-[backdrop-filter]:backdrop-blur-sm',
              'border-sky-300 bg-sky-50 text-sky-950',
              'dark:border-sky-800 dark:bg-sky-950/85 dark:text-sky-50',
            ].join(' ')}
          >
            <span>{t('offline.bannerPendingWithCount', { count: pendingCount })}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-sky-400/70 bg-background/80 shrink-0"
              disabled={syncing}
              onClick={() => void flushPendingQueue()}
            >
              <RefreshCw
                className={`me-1 inline h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`}
                aria-hidden
              />
              {syncing ? t('offline.syncing') : t('offline.syncNow')}
            </Button>
          </div>
        : null}
      </div>
    </div>
  );
}
