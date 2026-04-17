import { useEffect, useState } from 'react';

/** Re-computes relative time for live feeds (poll-friendly). */
export function useRelativeTime(iso: string, locale: string, tickMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  return formatRelativeTime(iso, locale, now);
}

export function formatRelativeTime(
  iso: string,
  locale: string,
  nowMs: number,
): string {
  const d = new Date(iso);
  const sec = Math.round((nowMs - d.getTime()) / 1000);
  const loc = locale.startsWith('ar') ? 'ar' : 'en';
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
  if (!Number.isFinite(sec)) return '—';
  if (sec < 45) return rtf.format(-Math.max(sec, 0), 'second');
  const min = Math.round(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (hr < 48) return rtf.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  return rtf.format(-day, 'day');
}
