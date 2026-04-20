"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DailyCollectionsReconciliationCronService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyCollectionsReconciliationCronService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const Sentry = __importStar(require("@sentry/node"));
const kuwait_time_1 = require("../common/time/kuwait-time");
const prisma_service_1 = require("../prisma/prisma.service");
const call_center_service_1 = require("./call-center.service");
const AUDIT_RESOURCE = '/call-center/reconciliation';
const AUDIT_ACTION_CLEAN = 'RECONCILIATION_CLEAN';
const AUDIT_ACTION_DRIFT = 'RECONCILIATION_DRIFT';
let DailyCollectionsReconciliationCronService = DailyCollectionsReconciliationCronService_1 = class DailyCollectionsReconciliationCronService {
    prisma;
    callCenter;
    logger = new common_1.Logger(DailyCollectionsReconciliationCronService_1.name);
    constructor(prisma, callCenter) {
        this.prisma = prisma;
        this.callCenter = callCenter;
    }
    async handleCron() {
        try {
            const report = await this.callCenter.getDailyCollectionsReconciliation({});
            await this.prisma.auditLog.create({
                data: {
                    action: report.overallStatus === 'DRIFT'
                        ? AUDIT_ACTION_DRIFT
                        : AUDIT_ACTION_CLEAN,
                    resource: AUDIT_RESOURCE,
                    changes: report,
                },
            });
            if (report.overallStatus === 'DRIFT') {
                const breakdown = report.checks
                    .filter((c) => c.status === 'DRIFT')
                    .map((c) => `${c.id}: Δ=${c.deltaKd} KWD`)
                    .join('; ');
                this.logger.warn(`[CC-RECONCILIATION] ${report.dayIsoLocal} DRIFT — ${breakdown}`);
                Sentry.captureMessage(`[CC-RECONCILIATION] Daily collections drift on ${report.dayIsoLocal}: ${breakdown}`, {
                    level: 'warning',
                    extra: { report: report },
                    tags: { module: 'call-center', check: 'reconciliation' },
                });
            }
            else {
                this.logger.log(`[CC-RECONCILIATION] ${report.dayIsoLocal} OK — collected TH=${report.totals.transactionHistory.collectedKd} / GL=${report.totals.generalLedger.collectedKd}`);
            }
        }
        catch (err) {
            this.logger.error(`[CC-RECONCILIATION] daily check failed: ${String(err)}`);
            Sentry.captureException(err, {
                tags: { module: 'call-center', check: 'reconciliation' },
            });
        }
    }
    async latestSnapshot() {
        const row = await this.prisma.auditLog.findFirst({
            where: {
                resource: AUDIT_RESOURCE,
                action: { in: [AUDIT_ACTION_CLEAN, AUDIT_ACTION_DRIFT] },
            },
            orderBy: { createdAt: 'desc' },
            select: { action: true, changes: true, createdAt: true },
        });
        if (!row)
            return null;
        const payload = row.changes;
        const dayIsoLocal = payload && typeof payload === 'object' && !Array.isArray(payload)
            ? payload.dayIsoLocal
            : undefined;
        return {
            status: row.action === AUDIT_ACTION_DRIFT ? 'DRIFT' : 'MATCH',
            recordedAtIso: row.createdAt.toISOString(),
            dayIsoLocal: dayIsoLocal ?? row.createdAt.toISOString().slice(0, 10),
        };
    }
};
exports.DailyCollectionsReconciliationCronService = DailyCollectionsReconciliationCronService;
__decorate([
    (0, schedule_1.Cron)('59 23 * * *', {
        name: 'cc-daily-reconciliation',
        timeZone: kuwait_time_1.KUWAIT_TIMEZONE,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DailyCollectionsReconciliationCronService.prototype, "handleCron", null);
exports.DailyCollectionsReconciliationCronService = DailyCollectionsReconciliationCronService = DailyCollectionsReconciliationCronService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        call_center_service_1.CallCenterService])
], DailyCollectionsReconciliationCronService);
//# sourceMappingURL=daily-collections-reconciliation.cron.js.map