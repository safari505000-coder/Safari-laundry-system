export class ReminderResultDto {
  /** true when the cooldown window elapsed and the counter was bumped. */
  sent!: boolean;
  /** Post-call reminder counter value. */
  reminderCount!: number;
  /** ISO of the last-reminder moment (pre-call for cooldown / post-call for sent). */
  lastReminderAtIso!: string | null;
  /**
   * When `sent = false`, this is the earliest ISO timestamp the frontend
   * may call again. Null when `sent = true`.
   */
  nextAllowedAtIso!: string | null;
  /**
   * Ceiling-hours until the next allowed send. Kept for backward
   * compatibility with screens that still render hours.
   */
  hoursUntilNext!: number | null;
  /**
   * V1.6.8 — Ceiling-minutes until the next allowed send. Preferred by
   * the Collections toast because the order-reminder cooldown is now
   * 2.5 h (9_000_000 ms) — hour resolution would always round up to
   * "3h" and be misleading.
   */
  minutesUntilNext!: number | null;
}
