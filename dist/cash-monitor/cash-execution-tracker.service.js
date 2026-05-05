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
var CashExecutionTrackerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashExecutionTrackerService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const cash_monitor_service_1 = require("./cash-monitor.service");
const REPEAT_ISSUE_THRESHOLD = 3;
let CashExecutionTrackerService = CashExecutionTrackerService_1 = class CashExecutionTrackerService {
    monitor;
    prisma;
    logger = new common_1.Logger(CashExecutionTrackerService_1.name);
    lastAtRisk = new Set();
    unsubscribe = null;
    constructor(monitor, prisma) {
        this.monitor = monitor;
        this.prisma = prisma;
    }
    onModuleInit() {
        this.unsubscribe = this.monitor.onOperationalSnapshot((op) => {
            this.ingestSnapshot(op).catch((e) => this.logger.warn(`execution tracker ingest failed: ${e.message}`));
        });
    }
    onModuleDestroy() {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.lastAtRisk.clear();
    }
    async recordAction(input) {
        if (input.allowedDriverIds &&
            !input.allowedDriverIds.has(input.driverId)) {
            throw new common_1.ForbiddenException('Driver is not in your branch scope.');
        }
        await this.prisma.cashIntelExecutionEvent.create({
            data: {
                driverId: input.driverId,
                eventType: client_1.CashIntelExecutionEventType.ACTION_LOGGED,
                action: input.action,
                resultStatus: client_1.CashIntelExecutionStatus.IN_PROGRESS,
                alertType: input.alertType ?? null,
                note: input.note ?? null,
                actorUserId: input.actor,
            },
        });
        return this.getExecutionBlock(input.driverId);
    }
    async getExecutionBlock(driverId) {
        const [statusRow, counts] = await Promise.all([
            this.prisma.cashIntelExecutionEvent.findFirst({
                where: {
                    driverId,
                    eventType: {
                        in: [
                            client_1.CashIntelExecutionEventType.ACTION_LOGGED,
                            client_1.CashIntelExecutionEventType.AUTO_RESOLVED,
                        ],
                    },
                },
                orderBy: { occurredAt: 'desc' },
                select: {
                    action: true,
                    resultStatus: true,
                    actorUserId: true,
                    occurredAt: true,
                },
            }),
            this.flagCounts(driverId),
        ]);
        return {
            status: statusRow?.resultStatus ??
                'OPEN',
            lastAction: statusRow?.action ??
                null,
            lastActionAt: statusRow?.occurredAt?.toISOString() ?? null,
            lastActor: statusRow?.actorUserId ?? null,
            flagsToday: counts.today,
            flagsThisWeek: counts.week,
            repeatIssue: counts.repeatIssue,
        };
    }
    async lateCountLast7Days(driverId) {
        return (await this.flagCounts(driverId)).week;
    }
    async lateCountsByDriver(driverIds) {
        const out = new Map();
        if (driverIds.length === 0)
            return out;
        const weekCutoff = new Date(Date.now() - 7 * 86_400_000);
        const grouped = await this.prisma.cashIntelExecutionEvent.groupBy({
            by: ['driverId'],
            where: {
                driverId: { in: [...driverIds] },
                eventType: client_1.CashIntelExecutionEventType.RISK_ENTERED,
                occurredAt: { gte: weekCutoff },
            },
            _count: { _all: true },
        });
        for (const row of grouped) {
            out.set(row.driverId, row._count._all);
        }
        return out;
    }
    async ingestSnapshot(op) {
        const currAtRisk = new Set(op.driversAtRisk.map((d) => d.driverId));
        const entries = [];
        const exits = [];
        for (const id of currAtRisk) {
            if (!this.lastAtRisk.has(id))
                entries.push(id);
        }
        for (const id of this.lastAtRisk) {
            if (!currAtRisk.has(id))
                exits.push(id);
        }
        if (entries.length > 0) {
            await this.prisma.cashIntelExecutionEvent.createMany({
                data: entries.map((driverId) => ({
                    driverId,
                    eventType: client_1.CashIntelExecutionEventType.RISK_ENTERED,
                    resultStatus: client_1.CashIntelExecutionStatus.OPEN,
                })),
            });
        }
        for (const driverId of exits) {
            const latest = await this.prisma.cashIntelExecutionEvent.findFirst({
                where: {
                    driverId,
                    eventType: {
                        in: [
                            client_1.CashIntelExecutionEventType.ACTION_LOGGED,
                            client_1.CashIntelExecutionEventType.AUTO_RESOLVED,
                        ],
                    },
                },
                orderBy: { occurredAt: 'desc' },
                select: { resultStatus: true },
            });
            if (latest?.resultStatus === client_1.CashIntelExecutionStatus.RESOLVED) {
                continue;
            }
            await this.prisma.cashIntelExecutionEvent.create({
                data: {
                    driverId,
                    eventType: client_1.CashIntelExecutionEventType.AUTO_RESOLVED,
                    resultStatus: client_1.CashIntelExecutionStatus.RESOLVED,
                },
            });
        }
        this.lastAtRisk = currAtRisk;
    }
    async flagCounts(driverId) {
        const now = new Date();
        const todayKw = kuwaitDayIso(now);
        const weekCutoff = new Date(now.getTime() - 7 * 86_400_000);
        const events = await this.prisma.cashIntelExecutionEvent.findMany({
            where: {
                driverId,
                eventType: client_1.CashIntelExecutionEventType.RISK_ENTERED,
                occurredAt: { gte: weekCutoff },
            },
            select: { occurredAt: true },
        });
        let today = 0;
        for (const e of events) {
            if (kuwaitDayIso(e.occurredAt) === todayKw)
                today++;
        }
        const week = events.length;
        return { today, week, repeatIssue: week > REPEAT_ISSUE_THRESHOLD };
    }
};
exports.CashExecutionTrackerService = CashExecutionTrackerService;
exports.CashExecutionTrackerService = CashExecutionTrackerService = CashExecutionTrackerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_monitor_service_1.CashMonitorService,
        prisma_service_1.PrismaService])
], CashExecutionTrackerService);
function kuwaitDayIso(d) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kuwait',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return fmt.format(d);
}
//# sourceMappingURL=cash-execution-tracker.service.js.map