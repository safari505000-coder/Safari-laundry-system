"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperatingHoursService = void 0;
const common_1 = require("@nestjs/common");
const KUWAIT_TZ = 'Asia/Kuwait';
const KUWAIT_OFFSET_MIN = 180;
let OperatingHoursService = class OperatingHoursService {
    isLockEnabled() {
        const v = process.env.OPERATING_HOURS_LOCK_ENABLED;
        if (v === 'false' || v === '0')
            return false;
        return true;
    }
    getKuwaitClockMinutes() {
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
    getWindowHours() {
        const startHour = Number.parseInt(process.env.OPERATING_HOURS_KUWAIT_START_HOUR ?? '7', 10);
        const endHour = Number.parseInt(process.env.OPERATING_HOURS_KUWAIT_END_HOUR ?? '24', 10);
        return { startHour, endHour };
    }
    isWithinOperatingWindow() {
        const { startHour, endHour } = this.getWindowHours();
        const mins = this.getKuwaitClockMinutes();
        const start = startHour * 60;
        const end = endHour * 60;
        return mins >= start && mins < end;
    }
    getStatusPayload() {
        const open = !this.isLockEnabled() || this.isWithinOperatingWindow();
        const reportingStartHour = Number.parseInt(process.env.REPORTING_DAY_KUWAIT_START_HOUR ?? '7', 10);
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
            financialDateIso,
            financialDateLabel: new Date().toLocaleDateString('en-GB', {
                timeZone: KUWAIT_TZ,
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: '2-digit',
            }),
            reportingDayStartHour: reportingStartHour,
            fullScreenClosedRoles: ['DRIVER'],
        };
    }
};
exports.OperatingHoursService = OperatingHoursService;
exports.OperatingHoursService = OperatingHoursService = __decorate([
    (0, common_1.Injectable)()
], OperatingHoursService);
//# sourceMappingURL=operating-hours.service.js.map