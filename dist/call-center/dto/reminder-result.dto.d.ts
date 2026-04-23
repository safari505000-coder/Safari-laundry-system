export declare class ReminderResultDto {
    sent: boolean;
    reminderCount: number;
    lastReminderAtIso: string | null;
    nextAllowedAtIso: string | null;
    hoursUntilNext: number | null;
    minutesUntilNext: number | null;
}
