import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

const KUWAIT_TZ = 'Asia/Kuwait';
const KUWAIT_OFFSET_MIN = 180; // UTC+03:00, no DST.

/** Business window: [startHour, endHour) Kuwait time — default 07:00–24:00 (ends at midnight). */
@Injectable()
export class OperatingHoursService implements OnModuleInit {
  private readonly logger = new Logger(OperatingHoursService.name);

  onModuleInit(): void {
    if (this.isLockEnabled()) {
      const w = this.getWindowHours();
      this.logger.log(
        `OPERATING_HOURS: lock ON — window ${w.startHour}:00–${w.endHour}:00 Asia/Kuwait; set OPERATING_HOURS_LOCK_ENABLED=false to open 24/7.`,
      );
    } else {
      this.logger.log(
        'OPERATING_HOURS: lock OFF — API + driver login ignore business window (re-enable lock when done).',
      );
    }
  }

  isLockEnabled(): boolean {
    const v = (process.env.OPERATING_HOURS_LOCK_ENABLED ?? '').trim().toLowerCase();
    // false | 0 | off | no — anything else (including unset) = lock on
    if (v === 'false' || v === '0' || v === 'off' || v === 'no') {
      return false;
    }
    return true;
  }

  getKuwaitClockMinutes(): number {
    const d = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: KUWAIT_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return hour * 60 + minute;
  }

  /**
   * Resolved [start, end) window in hours. Exposed so the middleware's
   * 403 payload can spell out the real configured limits instead of the
   * previously hard-coded "07:00 and 23:00" string.
   */
  getWindowHours(): { startHour: number; endHour: number } {
    const startHour = Number.parseInt(
      process.env.OPERATING_HOURS_KUWAIT_START_HOUR ?? '7',
      10,
    );
    const endHour = Number.parseInt(
      process.env.OPERATING_HOURS_KUWAIT_END_HOUR ?? '24',
      10,
    );
    return { startHour, endHour };
  }

  isWithinOperatingWindow(): boolean {
    const { startHour, endHour } = this.getWindowHours();
    const mins = this.getKuwaitClockMinutes();
    const start = startHour * 60;
    const end = endHour * 60;
    return mins >= start && mins < end;
  }

  getStatusPayload() {
    const open = !this.isLockEnabled() || this.isWithinOperatingWindow();
    const reportingStartHour = Number.parseInt(
      process.env.REPORTING_DAY_KUWAIT_START_HOUR ?? '7',
      10,
    );
    const nowUtc = new Date();
    const kuwait = new Date(nowUtc.getTime() + KUWAIT_OFFSET_MIN * 60_000);
    const y = kuwait.getUTCFullYear();
    const m = String(kuwait.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kuwait.getUTCDate()).padStart(2, '0');
    const financialDateIso = `${y}-${m}-${d}`;
    return {
      isOpen: open,
      /** Mirrors `OPERATING_HOURS_LOCK_ENABLED` for UI; when false, Driver POS should not full-screen "closed". */
      lockEnabled: this.isLockEnabled(),
      kuwaitTimeLabel: new Date().toLocaleString('en-GB', {
        timeZone: KUWAIT_TZ,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      /** Financial day rolls over strictly at 00:00 Kuwait time. */
      financialDateIso,
      financialDateLabel: new Date().toLocaleDateString('en-GB', {
        timeZone: KUWAIT_TZ,
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }),
      /** Default business start hour (reports default). Rollover still at midnight. */
      reportingDayStartHour: reportingStartHour,
      /** Roles that see the full-screen “system closed” experience (field staff). */
      fullScreenClosedRoles: ['DRIVER'] as const,
    };
  }
}
