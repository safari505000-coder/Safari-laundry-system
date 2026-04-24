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
    logger = new common_1.Logger(SerialGapService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async handleCron() {
        try {
            const report = await this.runDailyCheck();
            if (report.gapCount > 0) {
                this.logger.warn(`[SERIAL-GAP] ${report.gapCount} gap(s) across per-operator serials; aggregateHighMark=${report.currentCounter}`);
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
        const scannedAtIso = new Date().toISOString();
        const operators = await this.prisma.user.findMany({
            where: { driverPrefix: { not: null } },
            select: { id: true, driverPrefix: true },
        });
        let currentCounter = 0;
        let presentCount = 0;
        let gapCount = 0;
        const firstGaps = [];
        const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        for (const op of operators) {
            const p = (op.driverPrefix ?? '').trim();
            if (!p)
                continue;
            const key = serial_counter_service_1.SerialCounterService.orderSerialKeyForUser(op.id);
            const [counterRow, orderRows] = await Promise.all([
                this.prisma.serialCounter.findUnique({ where: { key } }),
                this.prisma.order.findMany({
                    where: { driverId: op.id, serialNumber: { startsWith: `${p}-` } },
                    select: { serialNumber: true },
                }),
            ]);
            const re = new RegExp(`^${esc(p)}-(\\d+)$`);
            let maxN = 0;
            const present = new Set();
            for (const r of orderRows) {
                if (!r.serialNumber)
                    continue;
                const m = r.serialNumber.match(re);
                if (m) {
                    const n = Number.parseInt(m[1], 10);
                    if (Number.isFinite(n)) {
                        maxN = Math.max(maxN, n);
                        present.add(n);
                    }
                }
            }
            const cFromRow = counterRow?.value ?? 0;
            const C = Math.max(cFromRow, maxN);
            if (C <= 0) {
                continue;
            }
            currentCounter += C;
            let slotFilled = 0;
            for (let i = 1; i <= C; i += 1) {
                if (present.has(i)) {
                    slotFilled += 1;
                }
            }
            presentCount += slotFilled;
            for (let i = 1; i <= C; i += 1) {
                if (!present.has(i)) {
                    gapCount += 1;
                    if (firstGaps.length < GAP_SAMPLE_LIMIT) {
                        firstGaps.push(`${p}-${i}`);
                    }
                }
            }
        }
        return {
            scannedAtIso,
            currentCounter,
            presentCount,
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SerialGapService);
//# sourceMappingURL=serial-gap.service.js.map