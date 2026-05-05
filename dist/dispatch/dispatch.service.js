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
var DispatchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchService = void 0;
exports.computeElapsedMinutes = computeElapsedMinutes;
exports.severityFor = severityFor;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const client_1 = require("@prisma/client");
const rxjs_1 = require("rxjs");
const audit_logs_service_1 = require("../audit-logs/audit-logs.service");
const prisma_service_1 = require("../prisma/prisma.service");
const dispatch_events_1 = require("./dispatch.events");
let DispatchService = DispatchService_1 = class DispatchService {
    prisma;
    auditLogs;
    events;
    logger = new common_1.Logger(DispatchService_1.name);
    driverStreams = new Map();
    constructor(prisma, auditLogs, events) {
        this.prisma = prisma;
        this.auditLogs = auditLogs;
        this.events = events;
    }
    async create(input) {
        const [customer, driver] = await Promise.all([
            this.prisma.customer.findUnique({
                where: { id: input.customerId },
                select: {
                    id: true,
                    isBlocked: true,
                    blockReason: true,
                    displayName: true,
                    phone: true,
                },
            }),
            this.prisma.user.findUnique({
                where: { id: input.driverId },
                select: {
                    id: true,
                    fullName: true,
                    username: true,
                    isActive: true,
                    safariRole: true,
                },
            }),
        ]);
        if (!customer) {
            throw new common_1.NotFoundException({
                code: 'CUSTOMER_NOT_FOUND',
                customerId: input.customerId,
            });
        }
        if (customer.isBlocked) {
            throw new common_1.ForbiddenException({
                code: 'CUSTOMER_BLOCKED',
                customerId: customer.id,
                blockReason: customer.blockReason,
            });
        }
        if (!driver || !driver.isActive) {
            throw new common_1.NotFoundException({
                code: 'DRIVER_NOT_FOUND',
                driverId: input.driverId,
            });
        }
        if (driver.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.BadRequestException({
                code: 'DRIVER_ROLE_MISMATCH',
                driverId: driver.id,
                actualRole: driver.safariRole,
            });
        }
        const dispatch = await this.prisma.dispatch.create({
            data: {
                customerId: input.customerId,
                driverId: input.driverId,
                instructionNote: input.instructionNote?.trim() || null,
                createdByUserId: input.actorUserId,
            },
        });
        this.auditLogs.log({
            action: 'DISPATCH_CREATED',
            resource: 'dispatch',
            status: 'SUCCESS',
            userId: input.actorUserId,
            role: input.actorRole,
            customerId: input.customerId,
            changes: {
                dispatchId: dispatch.id,
                driverId: input.driverId,
                instructionNote: dispatch.instructionNote,
            },
        });
        const driverDisplay = driver.fullName?.trim() || driver.username;
        const customerDisplay = customer.displayName?.trim() || customer.phone;
        const row = this.toRowDto(dispatch, {
            customerDisplay,
            customerPhone: customer.phone,
            driverName: driverDisplay,
        }, new Date());
        this.broadcastToDriver(input.driverId, {
            dispatchId: dispatch.id,
            driverId: dispatch.driverId,
            customerId: dispatch.customerId,
            status: dispatch.status,
            createdAtIso: dispatch.createdAt.toISOString(),
            completedAtIso: dispatch.completedAt?.toISOString() ?? null,
        });
        this.events.emit(dispatch_events_1.DISPATCH_CREATED_EVENT, row);
        return row;
    }
    async handleOrderCreated(payload) {
        if (!payload?.dispatchId)
            return;
        try {
            const result = await this.prisma.dispatch.updateMany({
                where: { id: payload.dispatchId, status: client_1.DispatchStatus.ASSIGNED },
                data: {
                    status: client_1.DispatchStatus.COMPLETED,
                    completedAt: new Date(),
                    completedByOrderId: payload.orderId,
                },
            });
            if (result.count === 0) {
                return;
            }
            const closed = await this.prisma.dispatch.findUnique({
                where: { id: payload.dispatchId },
                include: {
                    customer: { select: { displayName: true, phone: true } },
                    driver: { select: { fullName: true, username: true } },
                },
            });
            if (!closed)
                return;
            this.auditLogs.log({
                action: 'DISPATCH_COMPLETED',
                resource: 'dispatch',
                status: 'SUCCESS',
                userId: payload.actorUserId,
                customerId: closed.customerId,
                orderId: payload.orderId,
                changes: {
                    dispatchId: closed.id,
                    driverId: closed.driverId,
                    completedAt: closed.completedAt?.toISOString() ?? null,
                    completedByOrderId: closed.completedByOrderId,
                },
            });
            const stream = {
                dispatchId: closed.id,
                driverId: closed.driverId,
                customerId: closed.customerId,
                status: closed.status,
                createdAtIso: closed.createdAt.toISOString(),
                completedAtIso: closed.completedAt?.toISOString() ?? null,
            };
            this.broadcastToDriver(closed.driverId, stream);
            this.events.emit(dispatch_events_1.DISPATCH_COMPLETED_EVENT, stream);
        }
        catch (error) {
            this.logger.error(`dispatch_auto_complete_failed orderId=${payload.orderId} dispatchId=${payload.dispatchId ?? 'null'} reason=${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async listActive(input = {}) {
        const limit = clampPositive(input.limit, 200, 50);
        const rows = await this.prisma.dispatch.findMany({
            where: { status: client_1.DispatchStatus.ASSIGNED },
            orderBy: { createdAt: 'asc' },
            take: limit,
            include: {
                customer: { select: { displayName: true, phone: true } },
                driver: { select: { fullName: true, username: true } },
            },
        });
        const now = new Date();
        return {
            generatedAtIso: now.toISOString(),
            rows: rows.map((r) => this.toRowDto(r, {
                customerDisplay: r.customer.displayName?.trim() || r.customer.phone,
                customerPhone: r.customer.phone,
                driverName: r.driver.fullName?.trim() || r.driver.username,
            }, now)),
        };
    }
    async listForDriver(driverId) {
        const rows = await this.prisma.dispatch.findMany({
            where: {
                driverId,
                OR: [
                    { status: client_1.DispatchStatus.ASSIGNED },
                    {
                        status: client_1.DispatchStatus.COMPLETED,
                        completedAt: { gte: oneHourAgo() },
                    },
                ],
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                customer: { select: { displayName: true, phone: true } },
                driver: { select: { fullName: true, username: true } },
            },
        });
        const now = new Date();
        return {
            generatedAtIso: now.toISOString(),
            rows: rows.map((r) => this.toRowDto(r, {
                customerDisplay: r.customer.displayName?.trim() || r.customer.phone,
                customerPhone: r.customer.phone,
                driverName: r.driver.fullName?.trim() || r.driver.username,
            }, now)),
        };
    }
    async pickAlternateDriver(excludeDriverId) {
        const candidates = await this.prisma.user.findMany({
            where: {
                safariRole: client_1.SafariRole.DRIVER,
                isActive: true,
                id: { not: excludeDriverId },
            },
            select: { id: true },
        });
        if (candidates.length === 0)
            return null;
        const loads = await this.prisma.dispatch.groupBy({
            by: ['driverId'],
            where: {
                status: client_1.DispatchStatus.ASSIGNED,
                driverId: { in: candidates.map((c) => c.id) },
            },
            _count: { _all: true },
        });
        const loadById = new Map(loads.map((row) => [row.driverId, row._count._all]));
        return candidates
            .map((c) => ({ id: c.id, load: loadById.get(c.id) ?? 0 }))
            .sort((a, b) => a.load - b.load)[0];
    }
    async findEscalationCandidates(minAgeMinutes, limit = 50) {
        const cutoff = new Date(Date.now() - minAgeMinutes * 60_000);
        return this.prisma.dispatch.findMany({
            where: {
                status: client_1.DispatchStatus.ASSIGNED,
                createdAt: { lt: cutoff },
                children: { none: {} },
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
            select: {
                id: true,
                customerId: true,
                driverId: true,
                instructionNote: true,
            },
        });
    }
    async createSuccessor(input) {
        return this.prisma.dispatch.create({
            data: {
                customerId: input.parent.customerId,
                driverId: input.newDriverId,
                instructionNote: input.instructionNote?.trim() || null,
                createdByUserId: input.actorUserId,
                parentDispatchId: input.parent.id,
            },
        });
    }
    async runEscalationOnce(input) {
        const candidates = await this.findEscalationCandidates(input.minAgeMinutes, input.limit ?? 50);
        let escalated = 0;
        let skipped = 0;
        for (const parent of candidates) {
            const next = await this.pickAlternateDriver(parent.driverId);
            if (!next) {
                skipped += 1;
                this.logger.warn(`dispatch_escalation_skipped reason=NO_ALTERNATE_DRIVER parentId=${parent.id}`);
                continue;
            }
            const successor = await this.createSuccessor({
                parent,
                newDriverId: next.id,
                instructionNote: `تصعيد تلقائي بعد ${input.minAgeMinutes} دقيقة`,
                actorUserId: null,
            });
            this.auditLogs.log({
                action: 'DISPATCH_ESCALATED',
                resource: 'dispatch',
                status: 'SUCCESS',
                userId: null,
                role: 'SYSTEM',
                customerId: parent.customerId,
                source: 'AUTO_ESCALATION_CRON',
                changes: {
                    parentDispatchId: parent.id,
                    successorDispatchId: successor.id,
                    previousDriverId: parent.driverId,
                    newDriverId: next.id,
                    minAgeMinutes: input.minAgeMinutes,
                },
            });
            this.broadcastToDriver(next.id, {
                dispatchId: successor.id,
                driverId: successor.driverId,
                customerId: successor.customerId,
                status: successor.status,
                createdAtIso: successor.createdAt.toISOString(),
                completedAtIso: null,
            });
            this.events.emit(dispatch_events_1.DISPATCH_CREATED_EVENT, successor);
            escalated += 1;
        }
        return { inspected: candidates.length, escalated, skipped };
    }
    async reassign(input) {
        const current = await this.prisma.dispatch.findUnique({
            where: { id: input.dispatchId },
            select: {
                id: true,
                status: true,
                customerId: true,
                driverId: true,
                instructionNote: true,
            },
        });
        if (!current) {
            throw new common_1.NotFoundException({
                code: 'DISPATCH_NOT_FOUND',
                dispatchId: input.dispatchId,
            });
        }
        if (current.status !== client_1.DispatchStatus.ASSIGNED) {
            throw new common_1.BadRequestException({
                code: 'DISPATCH_NOT_ASSIGNED',
                dispatchId: current.id,
                currentStatus: current.status,
            });
        }
        if (current.driverId === input.newDriverId) {
            throw new common_1.BadRequestException({
                code: 'DRIVER_UNCHANGED',
                dispatchId: current.id,
            });
        }
        const newDriver = await this.prisma.user.findUnique({
            where: { id: input.newDriverId },
            select: { id: true, isActive: true, safariRole: true },
        });
        if (!newDriver || !newDriver.isActive) {
            throw new common_1.NotFoundException({
                code: 'DRIVER_NOT_FOUND',
                driverId: input.newDriverId,
            });
        }
        if (newDriver.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.BadRequestException({
                code: 'DRIVER_ROLE_MISMATCH',
                driverId: newDriver.id,
                actualRole: newDriver.safariRole,
            });
        }
        const successor = await this.createSuccessor({
            parent: current,
            newDriverId: input.newDriverId,
            instructionNote: input.reason?.trim() || `إعادة توجيه يدوي من قِبل مركز الاتصال`,
            actorUserId: input.actorUserId,
        });
        this.auditLogs.log({
            action: 'DISPATCH_REASSIGNED',
            resource: 'dispatch',
            status: 'SUCCESS',
            userId: input.actorUserId,
            role: input.actorRole,
            customerId: current.customerId,
            source: 'CALL_CENTER_MANUAL',
            changes: {
                parentDispatchId: current.id,
                successorDispatchId: successor.id,
                previousDriverId: current.driverId,
                newDriverId: input.newDriverId,
                reason: input.reason,
            },
        });
        this.broadcastToDriver(successor.driverId, {
            dispatchId: successor.id,
            driverId: successor.driverId,
            customerId: successor.customerId,
            status: successor.status,
            createdAtIso: successor.createdAt.toISOString(),
            completedAtIso: null,
        });
        this.events.emit(dispatch_events_1.DISPATCH_CREATED_EVENT, successor);
        return successor;
    }
    async findReconciliationCandidates(limit = 100) {
        const rows = await this.prisma.dispatch.findMany({
            where: {
                status: client_1.DispatchStatus.ASSIGNED,
                orders: { some: {} },
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
            select: {
                id: true,
                customerId: true,
                orders: {
                    orderBy: { createdAt: 'asc' },
                    take: 1,
                    select: { id: true },
                },
            },
        });
        return rows
            .map((d) => ({
            id: d.id,
            customerId: d.customerId,
            orderId: d.orders[0]?.id ?? '',
        }))
            .filter((r) => r.orderId);
    }
    async reconcileOne(input) {
        const result = await this.prisma.dispatch.updateMany({
            where: {
                id: input.dispatchId,
                status: client_1.DispatchStatus.ASSIGNED,
            },
            data: {
                status: client_1.DispatchStatus.COMPLETED,
                completedAt: new Date(),
                completedByOrderId: input.orderId,
            },
        });
        if (result.count === 0) {
            return { closed: false };
        }
        this.auditLogs.log({
            action: 'DISPATCH_RECONCILED',
            resource: 'dispatch',
            status: 'SUCCESS',
            userId: null,
            role: 'SYSTEM',
            customerId: input.customerId,
            orderId: input.orderId,
            source: 'RECONCILIATION_CRON',
            changes: {
                dispatchId: input.dispatchId,
                completedByOrderId: input.orderId,
            },
        });
        return { closed: true };
    }
    async runReconciliationOnce(input = {}) {
        const candidates = await this.findReconciliationCandidates(input.limit);
        let closed = 0;
        for (const c of candidates) {
            const result = await this.reconcileOne({
                dispatchId: c.id,
                orderId: c.orderId,
                customerId: c.customerId,
            });
            if (result.closed)
                closed += 1;
        }
        return { inspected: candidates.length, closed };
    }
    subscribeDriverStream(driverId) {
        const existing = this.driverStreams.get(driverId);
        if (existing)
            return existing;
        const subject = new rxjs_1.Subject();
        this.driverStreams.set(driverId, subject);
        return subject;
    }
    unsubscribeDriverStream(driverId, subject) {
        const current = this.driverStreams.get(driverId);
        if (current && current === subject) {
            this.driverStreams.delete(driverId);
        }
    }
    broadcastToDriver(driverId, payload) {
        const subject = this.driverStreams.get(driverId);
        if (!subject)
            return;
        try {
            subject.next(payload);
        }
        catch (error) {
            this.logger.warn(`dispatch_sse_broadcast_failed driverId=${driverId} reason=${error instanceof Error ? error.message : String(error)}`);
        }
    }
    toRowDto(d, presentation, now) {
        const elapsedMinutes = computeElapsedMinutes(d.createdAt, d.status === client_1.DispatchStatus.COMPLETED ? (d.completedAt ?? now) : now);
        const severity = severityFor(d.status, elapsedMinutes);
        return {
            id: d.id,
            status: d.status,
            severity,
            elapsedMinutes,
            customerId: d.customerId,
            customerDisplay: presentation.customerDisplay,
            customerPhone: presentation.customerPhone,
            driverId: d.driverId,
            driverName: presentation.driverName,
            instructionNote: d.instructionNote,
            createdAtIso: d.createdAt.toISOString(),
            completedAtIso: d.completedAt?.toISOString() ?? null,
            completedByOrderId: d.completedByOrderId,
        };
    }
};
exports.DispatchService = DispatchService;
__decorate([
    (0, event_emitter_1.OnEvent)(dispatch_events_1.ORDER_CREATED_EVENT, { async: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DispatchService.prototype, "handleOrderCreated", null);
exports.DispatchService = DispatchService = DispatchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_logs_service_1.AuditLogsService,
        event_emitter_1.EventEmitter2])
], DispatchService);
function computeElapsedMinutes(start, end) {
    const ms = end.getTime() - start.getTime();
    if (!Number.isFinite(ms) || ms < 0)
        return 0;
    return Math.floor(ms / 60_000);
}
function severityFor(status, elapsedMinutes) {
    if (status === client_1.DispatchStatus.COMPLETED)
        return 'COMPLETED';
    if (elapsedMinutes >= 20)
        return 'CRITICAL';
    if (elapsedMinutes >= 10)
        return 'LATE';
    return 'ON_TIME';
}
function clampPositive(value, max, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return Math.min(Math.floor(value), max);
}
function oneHourAgo() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - 60);
    return d;
}
//# sourceMappingURL=dispatch.service.js.map