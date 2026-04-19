"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SerialGapService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SerialGapService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
const kuwait_time_1 = require("../common/time/kuwait-time");
const serial_counter_service_1 = require("./serial-counter.service");
const GAP_SAMPLE_LIMIT = 50;
const AUDIT_ACTION_GAP = 'ORDER_SERIAL_GAP_DETECTED';
const AUDIT_ACTION_CLEAN = 'ORDER_SERIAL_GAP_SCAN_CLEAN';
const AUDIT_RESOURCE = '/owner/serials/gaps';
let SerialGapService = SerialGapService_1 = class SerialGapService {
    prisma;
    counter;
    logger = new common_1.Logger(SerialGapService_1.name);
    constructor(prisma, counter) {
        this.prisma = prisma;
        this.counter = counter;
    }
    async handleCron() {
        try {
            const report = await this.runDailyCheck();
            if (report.gapCount > 0) {
                this.logger.warn(`[SERIAL-GAP] ${report.gapCount} gap(s) detected; counter=${report.currentCounter}`);
            }
        }
        catch (err) {
            this.logger.error(`[SERIAL-GAP] daily scan failed: ${String(err)}`);
        }
    }
    async runDailyCheck() {
        const report = await this.scanGaps();
        await this.recordScanAudit(report);
        return report;
    }
    scanNow() {
        return this.runDailyCheck();
    }
    async scanGaps() {
        const currentCounter = await this.counter.peek();
        const scannedAtIso = new Date().toISOString();
        if (currentCounter <= 0) {
            return {
                scannedAtIso,
                currentCounter,
                presentCount: 0,
                gapCount: 0,
                firstGaps: [],
                allGapsTruncated: false,
            };
        }
        const rows = await this.prisma.order.findMany({
            where: { serialNumber: { not: null } },
            select: { serialNumber: true },
        });
        const present = new Set();
        for (const r of rows) {
            const n = extractCounter(r.serialNumber);
            if (n !== null && n >= 1 && n <= currentCounter) {
                present.add(n);
            }
        }
        const firstGaps = [];
        let gapCount = 0;
        for (let i = 1; i <= currentCounter; i++) {
            if (!present.has(i)) {
                gapCount += 1;
                if (firstGaps.length < GAP_SAMPLE_LIMIT) {
                    firstGaps.push(i);
                }
            }
        }
        return {
            scannedAtIso,
            currentCounter,
            presentCount: present.size,
            gapCount,
            firstGaps,
            allGapsTruncated: gapCount > firstGaps.length,
        };
    }
    async latestReport() {
        const row = await this.prisma.auditLog.findFirst({
            where: {
                resource: AUDIT_RESOURCE,
                action: { in: [AUDIT_ACTION_GAP, AUDIT_ACTION_CLEAN] },
            },
            orderBy: { createdAt: 'desc' },
            select: { action: true, changes: true, createdAt: true },
        });
        if (!row)
            return null;
        const payload = row.changes;
        if (!payload || typeof payload !== 'object')
            return null;
        const report = payload;
        return {
            report,
            hadGaps: row.action === AUDIT_ACTION_GAP,
            recordedAtIso: row.createdAt.toISOString(),
        };
    }
    async recordScanAudit(report) {
        await this.prisma.auditLog.create({
            data: {
                action: report.gapCount > 0 ? AUDIT_ACTION_GAP : AUDIT_ACTION_CLEAN,
                resource: AUDIT_RESOURCE,
                changes: report,
            },
        });
    }
};
exports.SerialGapService = SerialGapService;
__decorate([
    (0, schedule_1.Cron)('5 0 * * *', { timeZone: kuwait_time_1.KUWAIT_TIMEZONE }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SerialGapService.prototype, "handleCron", null);
exports.SerialGapService = SerialGapService = SerialGapService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        serial_counter_service_1.SerialCounterService])
], SerialGapService);
function extractCounter(serial) {
    if (!serial)
        return null;
    const m = serial.match(/-(\d+)$/);
    if (!m)
        return null;
    const n = Number.parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
}
//# sourceMappingURL=serial-gap.service.js.map