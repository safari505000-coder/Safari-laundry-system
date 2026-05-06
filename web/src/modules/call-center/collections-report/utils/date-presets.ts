/**
 * Kuwait-local date presets for the Collections Report.
 *
 * Kuwait runs on AST (UTC+3) without daylight saving, so we shift the
 * UTC clock by a fixed offset to compute "today / this week / this
 * month" boundaries that match the Operations team's intuition. The
 * returned values are ISO `YYYY-MM-DD` strings — the same shape the
 * `/api/finance/outstanding` filter accepts.
 *
 * IMPORTANT: This module produces UI-side filter values only. The
 * backend remains the sole source of monetary truth — any preset is
 * forwarded to the existing API and the response (including
 * `totalDueKd`) is rendered as-is.
 */

const KW_OFFSET_MS = 3 * 60 * 60 * 1_000;

export type DatePreset = 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

export type DateRange = {
  /** Inclusive lower bound, `YYYY-MM-DD`. */
  from: string;
  /** Inclusive upper bound, `YYYY-MM-DD`. */
  to: string;
};

function kwLocalDate(date: Date): Date {
  // We shift the UTC instant forward by Kuwait's offset and then read
  // the *UTC* getters — that gives us the Kuwait-local Y/M/D values.
  return new Date(date.getTime() + KW_OFFSET_MS);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toIsoDate(date: Date): string {
  const kw = kwLocalDate(date);
  return `${kw.getUTCFullYear()}-${pad2(kw.getUTCMonth() + 1)}-${pad2(kw.getUTCDate())}`;
}

/**
 * Returns the YYYY-MM-DD pair for the requested preset using Kuwait
 * local time. Returns `null` for `CUSTOM` so the caller knows to use
 * its own `from` / `to` state instead.
 */
export function presetToRange(
  preset: DatePreset,
  now: Date = new Date(),
): DateRange | null {
  if (preset === 'CUSTOM') return null;
  const kwNow = kwLocalDate(now);
  if (preset === 'TODAY') {
    const today = toIsoDate(now);
    return { from: today, to: today };
  }
  if (preset === 'WEEK') {
    // Kuwait week starts on Saturday (day 6 in JS).
    const day = kwNow.getUTCDay();
    const offset = (day + 1) % 7; // Sun=0,Mon=1,...,Sat=6 -> 1,2,3,4,5,6,0
    const start = new Date(now.getTime() - offset * 86_400_000);
    return { from: toIsoDate(start), to: toIsoDate(now) };
  }
  // MONTH
  const start = new Date(
    Date.UTC(kwNow.getUTCFullYear(), kwNow.getUTCMonth(), 1)
      - KW_OFFSET_MS,
  );
  return { from: toIsoDate(start), to: toIsoDate(now) };
}

export const DATE_PRESET_OPTIONS: { id: DatePreset; label: string }[] = [
  { id: 'TODAY', label: 'اليوم' },
  { id: 'WEEK', label: 'هذا الأسبوع' },
  { id: 'MONTH', label: 'هذا الشهر' },
  { id: 'CUSTOM', label: 'مخصّص' },
];
