import { Wifi, WifiOff, CloudUpload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOfflineSyncOptional } from '@/offline/offline-sync-context';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  dense?: boolean;
};

/**
 * Online / Offline chip + queued sync count (when > 0).
 */
export function ConnectivityBadge({ className, dense }: Props) {
  const { t } = useTranslation();
  const ctx = useOfflineSyncOptional();
  const online = ctx?.online ?? readNavigatorOnline();
  const pending = ctx?.pendingCount ?? 0;
  const syncing = ctx?.syncing ?? false;

  return (
    <div
      className={cn(
        'flex max-w-[min(100%,14rem)] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none shadow-sm',
        online
          ? pending > 0
            ? 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-50'
            : 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-50'
          : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50',
        dense && 'py-0.5',
        className,
      )}
      role="status"
      aria-live="polite"
      title={
        syncing
          ? t('offline.syncing')
          : !online
            ? t('offline.bannerOfflineHint')
            : pending > 0
              ? t('offline.bannerPendingHint')
              : ''
      }
    >
      {syncing ?
        <CloudUpload className="h-3.5 w-3.5 shrink-0 animate-pulse" aria-hidden />
      : online ?
        <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden />
      : <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span className="min-w-0 truncate">
        {online ? t('offline.statusOnline') : t('offline.statusOffline')}
        {online && pending > 0 ?
          ` · ${pending.toString()}`
        : ''}
      </span>
    </div>
  );
}

function readNavigatorOnline(): boolean {
  if (typeof navigator === 'undefined') {
    return true;
  }
  return navigator.onLine;
}
