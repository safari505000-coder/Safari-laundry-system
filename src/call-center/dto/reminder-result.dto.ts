export class ReminderResultDto {
  /** true when the 24-hour window elapsed and the counter was bumped. */
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
  /** Optional payload hint: for cooldown messages in the toast. */
  hoursUntilNext!: number | null;
}
