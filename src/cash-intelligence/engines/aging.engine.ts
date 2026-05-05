/**
 * Cash Aging Engine — stabilisation-cleaned helper.
 *
 * After the v1 retirement, only the calendar-day diff utility remains
 * (used by v2 to populate the informational `ageDays` field on each
 * flow row). All classification gates have been migrated to
 * hour-precision (`ageHours >= 24`) per the SSoT contract; `ageDays`
 * is reported only for downstream display formatting.
 */
export function kuwaitCalendarDiff(originDay: string, todayDay: string): number {
  const o = parseKuwaitDay(originDay);
  const t = parseKuwaitDay(todayDay);
  const ms = t.getTime() - o.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / 86_400_000);
}

function parseKuwaitDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}
