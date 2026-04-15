import { Injectable } from '@nestjs/common';

const KUWAIT_TZ = 'Asia/Kuwait';
const KUWAIT_OFFSET_MIN = 180; // UTC+03:00, no DST.

/** Business window: [startHour, endHour) Kuwait time — default 07:00–23:00 (last minute 22:59). */
@Injectable()
export class OperatingHoursService {
  isLockEnabled(): boolean {
    const v = process.env.OPERATING_HOURS_LOCK_ENABLED;
    if (v === 'false' || v === '0') return false;
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

  isWithinOperatingWindow(): boolean {
    const startH = Number.parseInt(
      process.env.OPERATING_HOURS_KUWAIT_START_HOUR ?? '7',
      10,
    );
    const endH = Number.parseInt(
      process.env.OPERATING_HOURS_KUWAIT_END_HOUR ?? '23',
      10,
    );
    const mins = this.getKuwaitClockMinutes();
    const start = startH * 60;
    const end = endH * 60;
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
