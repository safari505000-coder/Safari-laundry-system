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
exports.slaToneDispatch = slaToneDispatch;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const client_1 = require("@prisma/client");
const rxjs_1 = require("rxjs");
const audit_logs_service_1 = require("../audit-logs/audit-logs.service");
const prisma_service_1 = require("../prisma/prisma.service");
const dispatch_metrics_service_1 = require("./dispatch-metrics.service");
const dispatch_events_1 = require("./dispatch.events");
let DispatchService = class DispatchService {
    static { DispatchService_1 = this; }
    prisma;
    auditLogs;
    events;
    metrics;
    logger = new common_1.Logger(DispatchService_1.name);
    driverStreams = new Map();
    constructor(prisma, auditLogs, events, metrics) {
        this.prisma = prisma;
        this.auditLogs = auditLogs;
        this.events = events;
        this.metrics = metrics;
    }
    kuwaitCalendarDayBoundsUtc(now) {
        const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000;
        const MS_PER_DAY = 86_400_000;
        const shifted = new Date(now.getTime() + KUWAIT_OFFSET_MS);
        const y = shifted.getUTCFullYear();
        const m = shifted.getUTCMonth();
        const d = shifted.getUTCDate();
        const dayStart = new Date(Date.UTC(y, m, d) - KUWAIT_OFFSET_MS);
        const dayEndExclusive = new Date(dayStart.getTime() + MS_PER_DAY);
        return { dayStart, dayEndExclusive };
    }
    static CC_CREATOR_ROLES = [
        client_1.SafariRole.CALL_CENTER,
        client_1.SafariRole.CALL_CENTER_SUPERVISOR,
    ];
    static CC_DASHBOARD_MAX_ASSIGNMENT_AGE_MS = 4 * 60 * 60 * 1000;
    ccTrackedDispatchWhere(now = new Date()) {
        const { dayStart, dayEndExclusive } = this.kuwaitCalendarDayBoundsUtc(now);
        const recentCutoff = new Date(now.getTime() - DispatchService_1.CC_DASHBOARD_MAX_ASSIGNMENT_AGE_MS);
        const createdFrom = recentCutoff.getTime() > dayStart.getTime() ? recentCutoff : dayStart;
        return {
            status: client_1.DispatchStatus.ASSIGNED,
            createdAt: {
                gte: createdFrom,
                lt: dayEndExclusive,
            },
            createdBy: {
                is: {
                    safariRole: { in: DispatchService_1.CC_CREATOR_ROLES },
                },
            },
        };
    }
    driverQueueDispatchWhere() {
        return {
            status: {
                in: [client_1.DispatchStatus.ASSIGNED, client_1.DispatchStatus.IN_PROGRESS],
            },
            createdBy: {
                is: {
                    safariRole: { in: DispatchService_1.CC_CREATOR_ROLES },
                },
            },
        };
    }
    isCallCenterCreatorRole(actorRole) {
        if (!actorRole)
            return false;
        return DispatchService_1.CC_CREATOR_ROLES.includes(actorRole);
    }
    finalizeCcDispatchRows(context, raw, policy) {
        const before = raw.length;
        const allowed = policy === 'cc_dashboard_strict'
            ? new Set([client_1.DispatchStatus.ASSIGNED])
            : new Set([
                client_1.DispatchStatus.ASSIGNED,
                client_1.DispatchStatus.IN_PROGRESS,
            ]);
        const seen = new Set();
        const out = [];
        for (const r of raw) {
            if (!r.driverId?.trim() || !r.customerId?.trim())
                continue;
            if (!allowed.has(r.status))
                continue;
            if (seen.has(r.id))
                continue;
            seen.add(r.id);
            out.push(r);
        }
        console.log('[CC STRICT FILTER]', {
            context,
            before,
            after: out.length,
        });
        return out;
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
        if (!driver.id?.trim()) {
            throw new common_1.BadRequestException({
                code: 'INVALID_DRIVER_ASSIGNMENT',
                message: 'Invalid driverId assignment',
            });
        }
        const duplicate = await this.prisma.dispatch.findFirst({
            where: {
                customerId: customer.id,
                driverId: driver.id,
                status: client_1.DispatchStatus.ASSIGNED,
            },
            orderBy: { createdAt: 'desc' },
        });
        if (duplicate) {
            this.logger.warn(`dispatch_duplicate_create_prevented customerId=${customer.id} driverId=${driver.id} dispatchId=${duplicate.id}`);
            return this.toRowDto(duplicate, {
                customerDisplay: customer.displayName?.trim() || customer.phone,
                customerPhone: customer.phone,
                driverName: driver.fullName?.trim() || driver.username,
            }, new Date());
        }
        const isCallCenterDispatch = this.isCallCenterCreatorRole(input.actorRole);
        const createdByUserId = isCallCenterDispatch && input.actorUserId ? input.actorUserId : null;
        const dispatch = await this.prisma.dispatch.create({
            data: {
                customerId: input.customerId,
                driverId: driver.id,
                instructionNote: input.instructionNote?.trim() || null,
                createdByUserId,
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
                driverId: driver.id,
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
        try {
            await this.metrics.incrementAssigned(driver.id, dispatch.createdAt);
        }
        catch (error) {
            this.logger.warn(`dispatch_metrics_assigned_increment_failed driverId=${driver.id} reason=${error instanceof Error ? error.message : String(error)}`);
        }
        this.broadcastDriverEnvelope(driver.id, {
            event: 'dispatch:new',
            row,
        });
        this.events.emit(dispatch_events_1.DISPATCH_CREATED_EVENT, row);
        return row;
    }
    async handleOrderCreated(payload) {
        if (!payload?.dispatchId)
            return;
        try {
            const closedAt = (() => {
                const parsed = new Date(payload.occurredAtIso);
                return Number.isFinite(parsed.getTime()) ? parsed : new Date();
            })();
            const before = await this.prisma.dispatch.findUnique({
                where: { id: payload.dispatchId },
                select: {
                    id: true,
                    createdAt: true,
                    driverId: true,
                    customerId: true,
                },
            });
            if (!before)
                return;
            const totalMinutes = computeElapsedMinutes(before.createdAt, closedAt);
            const result = await this.prisma.dispatch.updateMany({
                where: {
                    id: payload.dispatchId,
                    status: { in: [client_1.DispatchStatus.ASSIGNED, client_1.DispatchStatus.IN_PROGRESS] },
                },
                data: {
                    status: client_1.DispatchStatus.COMPLETED,
                    completedAt: closedAt,
                    completedByOrderId: payload.orderId,
                    totalMinutes,
                },
            });
            if (result.count === 0) {
                return;
            }
            try {
                await this.metrics.recordCompletion({
                    driverId: before.driverId,
                    at: closedAt,
                    totalMinutes,
                });
            }
            catch (error) {
                this.logger.warn(`dispatch_metrics_completion_failed dispatchId=${payload.dispatchId} reason=${error instanceof Error ? error.message : String(error)}`);
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
                    totalMinutes,
                },
            });
            const now = new Date();
            const row = this.toRowDto(closed, {
                customerDisplay: closed.customer.displayName?.trim() || closed.customer.phone,
                customerPhone: closed.customer.phone,
                driverName: closed.driver.fullName?.trim() || closed.driver.username,
            }, now);
            this.broadcastDriverEnvelope(closed.driverId, {
                event: 'dispatch:update',
                row,
            });
            this.events.emit(dispatch_events_1.DISPATCH_COMPLETED_EVENT, this.rowToStreamPayload(row));
        }
        catch (error) {
            this.logger.error(`dispatch_auto_complete_failed orderId=${payload.orderId} dispatchId=${payload.dispatchId ?? 'null'} reason=${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async listActive(input = {}) {
        const limit = clampPositive(input.limit, 200, 50);
        const now = new Date();
        const rows = await this.prisma.dispatch.findMany({
            where: this.ccTrackedDispatchWhere(now),
            orderBy: { createdAt: 'asc' },
            take: limit,
            include: {
                customer: { select: { displayName: true, phone: true } },
                driver: { select: { fullName: true, username: true } },
            },
        });
        const cleaned = this.finalizeCcDispatchRows('listActive', rows, 'cc_dashboard_strict');
        console.log('[CC API HIT]', cleaned.length);
        return {
            generatedAtIso: now.toISOString(),
            rows: cleaned.map((r) => this.toRowDto(r, {
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
                ...this.driverQueueDispatchWhere(),
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: {
                customer: { select: { displayName: true, phone: true } },
                driver: { select: { fullName: true, username: true } },
            },
        });
        const deduped = this.finalizeCcDispatchRows('listForDriver', rows, 'driver_queue');
        this.logger.debug(`driver_dispatch_poll driverId=${driverId} count=${deduped.length}`);
        const now = new Date();
        return {
            generatedAtIso: now.toISOString(),
            rows: deduped.map((r) => this.toRowDto(r, {
                customerDisplay: r.customer.displayName?.trim() || r.customer.phone,
                customerPhone: r.customer.phone,
                driverName: r.driver.fullName?.trim() || r.driver.username,
            }, now)),
        };
    }
    async acknowledge(input) {
        const now = new Date();
        const presentationSelect = {
            customer: { select: { displayName: true, phone: true } },
            driver: { select: { fullName: true, username: true } },
        };
        const existing = await this.prisma.dispatch.findUnique({
            where: { id: input.dispatchId },
            include: presentationSelect,
        });
        if (!existing) {
            throw new common_1.NotFoundException({
                code: 'DISPATCH_NOT_FOUND',
                dispatchId: input.dispatchId,
            });
        }
        if (existing.driverId !== input.driverId) {
            throw new common_1.ForbiddenException({
                code: 'DISPATCH_DRIVER_MISMATCH',
                dispatchId: input.dispatchId,
            });
        }
        if (existing.status !== client_1.DispatchStatus.ASSIGNED) {
            return this.toRowDto(existing, {
                customerDisplay: existing.customer.displayName?.trim() || existing.customer.phone,
                customerPhone: existing.customer.phone,
                driverName: existing.driver.fullName?.trim() || existing.driver.username,
            }, now);
        }
        const ackMinutes = computeElapsedMinutes(existing.createdAt, now);
        const result = await this.prisma.dispatch.updateMany({
            where: {
                id: input.dispatchId,
                driverId: input.driverId,
                status: client_1.DispatchStatus.ASSIGNED,
            },
            data: {
                status: client_1.DispatchStatus.IN_PROGRESS,
                acknowledgedAt: now,
                startedAt: now,
                ackMinutes,
            },
        });
        const latest = await this.prisma.dispatch.findUnique({
            where: { id: input.dispatchId },
            include: presentationSelect,
        });
        if (!latest) {
            throw new common_1.NotFoundException({
                code: 'DISPATCH_NOT_FOUND',
                dispatchId: input.dispatchId,
            });
        }
        if (result.count === 0) {
            return this.toRowDto(latest, {
                customerDisplay: latest.customer.displayName?.trim() || latest.customer.phone,
                customerPhone: latest.customer.phone,
                driverName: latest.driver.fullName?.trim() || latest.driver.username,
            }, now);
        }
        try {
            await this.metrics.recordAcknowledged(latest.driverId, now, ackMinutes);
        }
        catch (error) {
            this.logger.warn(`dispatch_metrics_ack_failed dispatchId=${latest.id} reason=${error instanceof Error ? error.message : String(error)}`);
        }
        this.auditLogs.log({
            action: 'DISPATCH_ACKNOWLEDGED',
            resource: 'dispatch',
            status: 'SUCCESS',
            userId: input.driverId,
            customerId: latest.customerId,
            changes: {
                dispatchId: latest.id,
                driverId: latest.driverId,
                acknowledgedAt: latest.acknowledgedAt?.toISOString() ?? null,
                ackMinutes,
            },
        });
        const row = this.toRowDto(latest, {
            customerDisplay: latest.customer.displayName?.trim() || latest.customer.phone,
            customerPhone: latest.customer.phone,
            driverName: latest.driver.fullName?.trim() || latest.driver.username,
        }, now);
        this.broadcastDriverEnvelope(latest.driverId, {
            event: 'dispatch:update',
            row,
        });
        this.events.emit(dispatch_events_1.DISPATCH_ACKNOWLEDGED_EVENT, this.rowToStreamPayload(row));
        return row;
    }
    async listAvailableDrivers() {
        const drivers = await this.prisma.user.findMany({
            where: {
                safariRole: client_1.SafariRole.DRIVER,
                isActive: true,
            },
            select: {
                id: true,
                fullName: true,
                username: true,
                isActive: true,
            },
            orderBy: { fullName: 'asc' },
        });
        if (drivers.length === 0)
            return [];
        const clock = new Date();
        const loads = await this.prisma.dispatch.groupBy({
            by: ['driverId'],
            where: {
                ...this.ccTrackedDispatchWhere(clock),
                driverId: { in: drivers.map((d) => d.id) },
            },
            _count: { _all: true },
        });
        const loadById = new Map(loads.map((row) => [row.driverId, row._count._all]));
        return drivers
            .map((d) => ({
            id: d.id,
            name: d.fullName?.trim() || d.username,
            isActive: d.isActive,
            activeLoad: loadById.get(d.id) ?? 0,
        }))
            .sort((a, b) => {
            const loadDelta = a.activeLoad - b.activeLoad;
            if (loadDelta !== 0)
                return loadDelta;
            return a.name.localeCompare(b.name);
        });
    }
    async runSlaMonitorOnce(input) {
        const limit = input.limit ?? 200;
        const now = new Date();
        const rowsRaw = await this.prisma.dispatch.findMany({
            where: this.ccTrackedDispatchWhere(now),
            orderBy: { createdAt: 'asc' },
            take: limit,
            include: {
                customer: { select: { displayName: true, phone: true } },
                driver: { select: { fullName: true, username: true } },
            },
        });
        const rows = this.finalizeCcDispatchRows('runSlaMonitorOnce', rowsRaw, 'cc_dashboard_strict');
        let firstAlerts = 0;
        let escalations = 0;
        let breaches = 0;
        for (const row of rows) {
            const ageMin = computeElapsedMinutes(row.createdAt, now);
            const needsPatch = (ageMin >= 2 && !row.firstAlertAt) ||
                (ageMin >= 5 && !row.escalatedAt) ||
                (ageMin >= 10 && !row.breachedAt);
            if (!needsPatch)
                continue;
            const hadFirst = !!row.firstAlertAt;
            const hadEsc = !!row.escalatedAt;
            const hadBr = !!row.breachedAt;
            try {
                await this.prisma.$transaction(async (tx) => {
                    const cur = await tx.dispatch.findUnique({
                        where: { id: row.id },
                        select: {
                            id: true,
                            status: true,
                            firstAlertAt: true,
                            escalatedAt: true,
                            breachedAt: true,
                        },
                    });
                    if (!cur || cur.status !== client_1.DispatchStatus.ASSIGNED)
                        return;
                    const patch = {};
                    if (ageMin >= 2 && !cur.firstAlertAt)
                        patch.firstAlertAt = now;
                    if (ageMin >= 5 && !cur.escalatedAt)
                        patch.escalatedAt = now;
                    if (ageMin >= 10 && !cur.breachedAt)
                        patch.breachedAt = now;
                    if (Object.keys(patch).length === 0)
                        return;
                    await tx.dispatch.update({
                        where: { id: cur.id },
                        data: patch,
                    });
                });
            }
            catch (error) {
                this.logger.warn(`dispatch_sla_monitor_row_failed dispatchId=${row.id} reason=${error instanceof Error ? error.message : String(error)}`);
                continue;
            }
            const fresh = await this.prisma.dispatch.findUnique({
                where: { id: row.id },
                include: {
                    customer: { select: { displayName: true, phone: true } },
                    driver: { select: { fullName: true, username: true } },
                },
            });
            if (!fresh || fresh.status !== client_1.DispatchStatus.ASSIGNED)
                continue;
            const alertNew = !hadFirst && !!fresh.firstAlertAt;
            const escNew = !hadEsc && !!fresh.escalatedAt;
            const brNew = !hadBr && !!fresh.breachedAt;
            if (!alertNew && !escNew && !brNew)
                continue;
            if (alertNew)
                firstAlerts += 1;
            if (escNew)
                escalations += 1;
            if (brNew)
                breaches += 1;
            const pres = {
                customerDisplay: fresh.customer.displayName?.trim() || fresh.customer.phone,
                customerPhone: fresh.customer.phone,
                driverName: fresh.driver.fullName?.trim() || fresh.driver.username,
            };
            const dto = this.toRowDto(fresh, pres, now);
            this.broadcastDriverEnvelope(fresh.driverId, {
                event: 'dispatch:alert',
                row: dto,
            });
            if (escNew) {
                this.events.emit('dispatch.sla.escalated', {
                    dispatchId: fresh.id,
                    driverId: fresh.driverId,
                    customerId: fresh.customerId,
                    escalatedAtIso: fresh.escalatedAt?.toISOString() ?? null,
                });
                void this.auditLogs.log({
                    action: 'DISPATCH_SLA_ESCALATED',
                    resource: 'dispatch',
                    status: 'SUCCESS',
                    userId: null,
                    role: 'SYSTEM',
                    customerId: fresh.customerId,
                    source: 'SLA_MONITOR_CRON',
                    changes: {
                        dispatchId: fresh.id,
                        driverId: fresh.driverId,
                        escalatedAt: fresh.escalatedAt?.toISOString() ?? null,
                    },
                });
            }
            if (brNew) {
                this.events.emit('dispatch.sla.breach', {
                    dispatchId: fresh.id,
                    driverId: fresh.driverId,
                    customerId: fresh.customerId,
                    breachedAtIso: fresh.breachedAt?.toISOString() ?? null,
                });
                void this.auditLogs.log({
                    action: 'DISPATCH_SLA_BREACH',
                    resource: 'dispatch',
                    status: 'SUCCESS',
                    userId: null,
                    role: 'SYSTEM',
                    customerId: fresh.customerId,
                    source: 'SLA_MONITOR_CRON',
                    changes: {
                        dispatchId: fresh.id,
                        driverId: fresh.driverId,
                        breachedAt: fresh.breachedAt?.toISOString() ?? null,
                    },
                });
            }
        }
        return {
            inspected: rows.length,
            firstAlerts,
            escalations,
            breaches,
        };
    }
    async monitorForCallCenter() {
        const now = new Date();
        const rows = await this.prisma.dispatch.findMany({
            where: this.ccTrackedDispatchWhere(now),
            orderBy: { createdAt: 'asc' },
            take: 500,
            include: {
                customer: { select: { displayName: true, phone: true } },
                driver: { select: { id: true, fullName: true, username: true } },
            },
        });
        const cleanedRows = this.finalizeCcDispatchRows('monitorForCallCenter', rows, 'cc_dashboard_strict');
        console.log('[CC API HIT]', cleanedRows.length);
        const driverNameById = new Map();
        const delayedByDispatchId = new Map();
        const allTasks = cleanedRows.map((r) => {
            const pres = {
                customerDisplay: r.customer.displayName?.trim() || r.customer.phone,
                customerPhone: r.customer.phone,
                driverName: r.driver.fullName?.trim() || r.driver.username,
            };
            driverNameById.set(r.driverId, pres.driverName);
            const dto = this.toRowDto(r, pres, now);
            const showInDelayedSection = dto.slaTone === 'BREACH' ||
                (dto.slaTone === 'LATE' && dto.elapsedMinutes >= 5);
            if (showInDelayedSection) {
                delayedByDispatchId.set(dto.id, dto);
            }
            return dto;
        });
        console.log('=== RAW TASKS ===');
        console.log(cleanedRows.map((t) => ({
            id: t.id,
            driverId: t.driverId,
            driverRelationId: t.driver.id,
            customerId: t.customerId,
            createdBy: t.createdByUserId,
        })));
        const drivers = [...driverNameById.entries()].map(([driverId, driverName]) => {
            const assignedTasks = allTasks.filter((t) => t.driverId === driverId);
            console.log('[DRIVER TASKS]', driverId, assignedTasks.length);
            return {
                driverId,
                driverName,
                activeAssignedCount: assignedTasks.length,
                lateCount: assignedTasks.filter((t) => t.slaTone === 'LATE').length,
                breachCount: assignedTasks.filter((t) => t.slaTone === 'BREACH').length,
                assignedTasks,
            };
        });
        return {
            generatedAtIso: now.toISOString(),
            drivers,
            delayedDriversSection: [...delayedByDispatchId.values()],
        };
    }
    async reassign(_input) {
        throw new common_1.ForbiddenException({
            code: 'DISPATCH_REASSIGN_FORBIDDEN',
            message: 'إعادة إسناد المهمة غير مسموحة — المهمة تبقى عند نفس السائق حتى إغلاق الفاتورة.',
        });
    }
    async findReconciliationCandidates(limit = 100) {
        const rows = await this.prisma.dispatch.findMany({
            where: {
                status: { in: [client_1.DispatchStatus.ASSIGNED, client_1.DispatchStatus.IN_PROGRESS] },
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
        const snapshot = await this.prisma.dispatch.findUnique({
            where: { id: input.dispatchId },
            select: { createdAt: true, driverId: true },
        });
        if (!snapshot) {
            return { closed: false };
        }
        const completedAt = new Date();
        const totalMinutes = computeElapsedMinutes(snapshot.createdAt, completedAt);
        const result = await this.prisma.dispatch.updateMany({
            where: {
                id: input.dispatchId,
                status: { in: [client_1.DispatchStatus.ASSIGNED, client_1.DispatchStatus.IN_PROGRESS] },
            },
            data: {
                status: client_1.DispatchStatus.COMPLETED,
                completedAt,
                completedByOrderId: input.orderId,
                totalMinutes,
            },
        });
        if (result.count === 0) {
            return { closed: false };
        }
        try {
            await this.metrics.recordCompletion({
                driverId: snapshot.driverId,
                at: completedAt,
                totalMinutes,
            });
        }
        catch (error) {
            this.logger.warn(`dispatch_metrics_reconcile_completion_failed dispatchId=${input.dispatchId} reason=${error instanceof Error ? error.message : String(error)}`);
        }
        const closedRow = await this.prisma.dispatch.findUnique({
            where: { id: input.dispatchId },
            include: {
                customer: { select: { displayName: true, phone: true } },
                driver: { select: { fullName: true, username: true } },
            },
        });
        if (closedRow) {
            const now = new Date();
            const row = this.toRowDto(closedRow, {
                customerDisplay: closedRow.customer.displayName?.trim() || closedRow.customer.phone,
                customerPhone: closedRow.customer.phone,
                driverName: closedRow.driver.fullName?.trim() || closedRow.driver.username,
            }, now);
            this.broadcastDriverEnvelope(closedRow.driverId, {
                event: 'dispatch:update',
                row,
            });
            this.events.emit(dispatch_events_1.DISPATCH_COMPLETED_EVENT, this.rowToStreamPayload(row));
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
                totalMinutes,
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
    broadcastDriverEnvelope(driverId, envelope) {
        const subject = this.driverStreams.get(driverId);
        if (!subject)
            return;
        try {
            subject.next(envelope);
        }
        catch (error) {
            this.logger.warn(`dispatch_sse_broadcast_failed driverId=${driverId} reason=${error instanceof Error ? error.message : String(error)}`);
        }
    }
    rowToStreamPayload(row) {
        return {
            dispatchId: row.id,
            driverId: row.driverId,
            customerId: row.customerId,
            status: row.status,
            createdAtIso: row.createdAtIso,
            acknowledgedAtIso: row.acknowledgedAtIso,
            completedAtIso: row.completedAtIso,
        };
    }
    toRowDto(d, presentation, now) {
        const elapsedMinutes = computeElapsedMinutes(d.createdAt, d.status === client_1.DispatchStatus.COMPLETED ? (d.completedAt ?? now) : now);
        const severity = severityFor(d.status, elapsedMinutes);
        const slaTone = slaToneDispatch(d, elapsedMinutes);
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
            acknowledgedAtIso: d.acknowledgedAt?.toISOString() ?? null,
            completedAtIso: d.completedAt?.toISOString() ?? null,
            completedByOrderId: d.completedByOrderId,
            startedAtIso: d.startedAt?.toISOString() ?? null,
            firstAlertAtIso: d.firstAlertAt?.toISOString() ?? null,
            escalatedAtIso: d.escalatedAt?.toISOString() ?? null,
            breachedAtIso: d.breachedAt?.toISOString() ?? null,
            ackMinutes: d.ackMinutes ?? null,
            totalMinutes: d.totalMinutes ?? null,
            slaTone,
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
        event_emitter_1.EventEmitter2,
        dispatch_metrics_service_1.DispatchMetricsService])
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
function slaToneDispatch(d, elapsedMinutesSinceCreated) {
    if (d.status === client_1.DispatchStatus.COMPLETED)
        return 'NORMAL';
    if (d.status === client_1.DispatchStatus.IN_PROGRESS)
        return 'NORMAL';
    if (d.breachedAt || elapsedMinutesSinceCreated >= 10)
        return 'BREACH';
    if (d.escalatedAt || elapsedMinutesSinceCreated >= 5)
        return 'LATE';
    if (d.firstAlertAt || elapsedMinutesSinceCreated >= 2)
        return 'LATE';
    return 'NORMAL';
}
function clampPositive(value, max, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return Math.min(Math.floor(value), max);
}
//# sourceMappingURL=dispatch.service.js.map