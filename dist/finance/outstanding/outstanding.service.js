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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutstandingService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const audit_logs_service_1 = require("../../audit-logs/audit-logs.service");
const orders_service_1 = require("../../orders/orders.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const STATUS_MUTATION_ROLES = new Set([
    'CALL_CENTER',
    'CALL_CENTER_SUPERVISOR',
    'OWNER',
]);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
let OutstandingService = class OutstandingService {
    prisma;
    auditLogs;
    orders;
    constructor(prisma, auditLogs, orders) {
        this.prisma = prisma;
        this.auditLogs = auditLogs;
        this.orders = orders;
    }
    async listOutstanding(query, actor) {
        console.log('[AR ENTRY]', {
            from: query.from ?? null,
            to: query.to ?? null,
            driverId: query.driverId ?? null,
            customerId: query.customerId ?? null,
            branchId: query.branchId ?? null,
            status: query.status ?? null,
            search: query.search ?? null,
            blocked: query.blocked ?? null,
        });
        const bounds = this.resolveReportingBounds(query.from, query.to);
        const queryBranch = query.branchId?.trim() || null;
        const effectiveBranchId = actor?.role === client_1.SafariRole.DRIVER ? null
            : queryBranch ??
                (actor?.role === client_1.SafariRole.MANAGER && actor.branchId ?
                    actor.branchId
                    : null);
        const hasOrderFilters = bounds.dateLimited ||
            Boolean(query.driverId) ||
            Boolean(query.customerId);
        const hasPostFilters = Boolean(query.status) ||
            typeof query.blocked === 'boolean' ||
            Boolean((query.search ?? '').trim());
        const noFilters = !hasOrderFilters && !hasPostFilters;
        console.log('[FILTERS]', {
            from: query.from ?? null,
            to: query.to ?? null,
            driverId: query.driverId ?? null,
            customerId: query.customerId ?? null,
            branchId: query.branchId ?? null,
            status: query.status ?? null,
            search: query.search ?? null,
            blocked: query.blocked ?? null,
            noFilters,
        });
        console.log('[AR BRANCH]', effectiveBranchId, actor?.role ?? null);
        console.log('[BRANCH_SCOPE]', effectiveBranchId, actor?.role ?? null);
        const canonicalTotalKdDec = await this.orders.sumCollectionsDebtTotalKd(effectiveBranchId, actor ?? undefined);
        const canonicalTotalDueKd = canonicalTotalKdDec.toFixed(3);
        console.log('[AR CANONICAL]', canonicalTotalDueKd);
        console.log('[AR ROW SOURCE START]');
        const aggOrders = await this.orders.listCollectionsReceivableAggOrders({
            branchId: effectiveBranchId,
            actor: actor ?? undefined,
            createdAt: bounds.createdAt,
            driverId: query.driverId,
            customerId: query.customerId,
        });
        if (!aggOrders) {
            console.log('[AR ROW COUNT]', 0);
            const response = this.emptyResponse(bounds.fromIso, bounds.toIso, canonicalTotalDueKd);
            this.traceDebtTotals({
                fromOrdersService: canonicalTotalDueKd,
                finalReturned: response.totalDueKd,
            });
            this.assertCanonicalTotal({
                canonicalTotalDueKd,
                finalReturned: response.totalDueKd,
            });
            return response;
        }
        console.log('[AR ROW COUNT]', aggOrders.length);
        if (aggOrders.length === 0) {
            const response = this.emptyResponse(bounds.fromIso, bounds.toIso, canonicalTotalDueKd);
            this.traceDebtTotals({
                fromOrdersService: canonicalTotalDueKd,
                finalReturned: response.totalDueKd,
            });
            this.assertCanonicalTotal({
                canonicalTotalDueKd,
                finalReturned: response.totalDueKd,
            });
            return response;
        }
        const rows = aggOrders;
        const grouped = this.groupByCustomer(rows);
        const customerIds = Array.from(grouped.keys());
        const driverIds = Array.from(new Set(rows
            .map((row) => row.driverId)
            .filter((id) => typeof id === 'string')));
        const [customers, drivers, statuses] = await Promise.all([
            this.prisma.customer.findMany({
                where: { id: { in: customerIds } },
                select: {
                    id: true,
                    displayName: true,
                    phone: true,
                    phone2: true,
                    isBlocked: true,
                },
            }),
            driverIds.length === 0
                ? Promise.resolve([])
                : this.prisma.user.findMany({
                    where: { id: { in: driverIds } },
                    select: { id: true, fullName: true },
                }),
            this.prisma.customerCollectionStatus.findMany({
                where: { customerId: { in: customerIds } },
            }),
        ]);
        const customerById = new Map(customers.map((c) => [c.id, c]));
        const driverById = new Map(drivers.map((d) => [d.id, d]));
        const statusById = new Map(statuses.map((s) => [s.customerId, s]));
        const now = Date.now();
        const allRows = [];
        for (const [customerId, orders] of grouped.entries()) {
            const customer = customerById.get(customerId);
            if (!customer)
                continue;
            const status = statusById.get(customerId);
            const driverId = orders[0]?.driverId ?? null;
            const driver = driverId ? driverById.get(driverId) ?? null : null;
            let totalDueDec = new client_1.Prisma.Decimal(0);
            let lastOrderAt = null;
            let earliestDue = null;
            for (const order of orders) {
                totalDueDec = totalDueDec.plus(order.totalPrice);
                if (!lastOrderAt || order.createdAt > lastOrderAt) {
                    lastOrderAt = order.createdAt;
                }
                if (order.dueDate instanceof Date &&
                    (!earliestDue || order.dueDate < earliestDue)) {
                    earliestDue = order.dueDate;
                }
            }
            const totalDueKd = round3Kd(totalDueDec);
            const daysLate = earliestDue
                ? Math.max(0, Math.floor((now - earliestDue.getTime()) / MS_PER_DAY))
                : 0;
            allRows.push({
                customerId,
                name: customer.displayName ?? null,
                phone: customer.phone,
                phone2: customer.phone2 ?? null,
                driverId,
                driverName: driver?.fullName ?? null,
                totalDueKd,
                invoicesCount: orders.length,
                lastOrderAt: lastOrderAt?.toISOString() ?? null,
                earliestDueDate: earliestDue?.toISOString() ?? null,
                daysLate,
                priorityScore: round4(totalDueKd * 0.6 + daysLate * 0.4),
                status: status?.status ?? client_1.CustomerCollectionStatusKind.NORMAL,
                blocked: status?.blocked ?? customer.isBlocked,
                note: status?.note ?? null,
            });
        }
        const filtered = this.applyPostFilters(allRows, query);
        filtered.sort((a, b) => b.priorityScore - a.priorityScore);
        const totals = {
            totalInvoices: 0,
            blockedCount: 0,
            lateCount: 0,
            riskCount: 0,
        };
        for (const row of filtered) {
            totals.totalInvoices += row.invoicesCount;
            if (row.blocked)
                totals.blockedCount += 1;
            if (row.status === client_1.CustomerCollectionStatusKind.LATE) {
                totals.lateCount += 1;
            }
            if (row.status === client_1.CustomerCollectionStatusKind.RISK) {
                totals.riskCount += 1;
            }
        }
        this.traceDebtTotals({
            fromOrdersService: canonicalTotalDueKd,
            finalReturned: canonicalTotalDueKd,
        });
        this.assertCanonicalTotal({
            canonicalTotalDueKd,
            finalReturned: canonicalTotalDueKd,
        });
        return {
            rows: filtered,
            totalCustomers: filtered.length,
            totalInvoices: totals.totalInvoices,
            totalDueKd: canonicalTotalDueKd,
            source: 'COLLECTIONS_ENGINE',
            blockedCount: totals.blockedCount,
            lateCount: totals.lateCount,
            riskCount: totals.riskCount,
            generatedAt: new Date().toISOString(),
            fromIso: bounds.fromIso,
            toIso: bounds.toIso,
        };
    }
    traceDebtTotals(input) {
        console.log('[DEBT TRACE]', {
            fromOrdersService: input.fromOrdersService,
            fromRows: 'DISABLED_SINGLE_SOURCE',
            finalReturned: input.finalReturned,
        });
    }
    assertCanonicalTotal(input) {
        if (input.canonicalTotalDueKd === input.finalReturned)
            return;
        console.error('[AR MISMATCH]', {
            totalDueKd: input.finalReturned,
            canonical: input.canonicalTotalDueKd,
        });
        const diff = Math.abs(new client_1.Prisma.Decimal(input.finalReturned)
            .sub(input.canonicalTotalDueKd)
            .toNumber());
        if (diff <= 0.001)
            return;
        console.error('[CRITICAL FINANCIAL INCONSISTENCY]', {
            totalDueKd: input.finalReturned,
            canonical: input.canonicalTotalDueKd,
            diff: diff.toFixed(3),
        });
    }
    async updateCollectionStatus(input) {
        const role = (input.actorRole ?? '').trim().toUpperCase();
        if (!STATUS_MUTATION_ROLES.has(role)) {
            throw new common_1.ForbiddenException('CUSTOMER_COLLECTION_STATUS_FORBIDDEN');
        }
        const customer = await this.prisma.customer.findUnique({
            where: { id: input.customerId },
            select: { id: true, isBlocked: true, blockReason: true, blockedAt: true },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const before = await this.prisma.customerCollectionStatus.findUnique({
            where: { customerId: input.customerId },
        });
        const blockedNote = (input.body.note ?? '').trim() || null;
        const wantBlocked = Boolean(input.body.blocked);
        const after = await this.prisma.customerCollectionStatus.upsert({
            where: { customerId: input.customerId },
            create: {
                customerId: input.customerId,
                status: input.body.status,
                blocked: wantBlocked,
                note: blockedNote,
                updatedById: input.actorUserId,
            },
            update: {
                status: input.body.status,
                blocked: wantBlocked,
                note: blockedNote,
                updatedById: input.actorUserId,
            },
        });
        if (wantBlocked && !customer.isBlocked) {
            await this.prisma.customer.update({
                where: { id: input.customerId },
                data: {
                    isBlocked: true,
                    blockReason: blockedNote ?? 'حظر يدوي - مركز الاتصال',
                    blockedAt: new Date(),
                },
            });
            this.auditLogs.logFinancialEvent({
                action: 'CUSTOMER_BLOCKED',
                customerId: input.customerId,
                userId: input.actorUserId,
                role: input.actorRole,
                source: 'OUTSTANDING_MANUAL_BLOCK',
                changes: { reason: blockedNote },
            });
        }
        else if (!wantBlocked && customer.isBlocked) {
            await this.prisma.customer.update({
                where: { id: input.customerId },
                data: { isBlocked: false, blockReason: null, blockedAt: null },
            });
            this.auditLogs.logFinancialEvent({
                action: 'CUSTOMER_UNBLOCKED',
                customerId: input.customerId,
                userId: input.actorUserId,
                role: input.actorRole,
                source: 'OUTSTANDING_MANUAL_UNBLOCK',
                changes: { reason: blockedNote },
            });
        }
        this.auditLogs.log({
            userId: input.actorUserId,
            role: input.actorRole,
            action: 'CUSTOMER_COLLECTION_UPDATED',
            resource: 'customer_collection_status',
            customerId: input.customerId,
            status: client_1.AuditStatus.SUCCESS,
            changes: {
                before: before
                    ? {
                        status: before.status,
                        blocked: before.blocked,
                        note: before.note,
                    }
                    : null,
                after: {
                    status: after.status,
                    blocked: after.blocked,
                    note: after.note,
                },
            },
        });
        return this.toStatusDto(after);
    }
    async getCollectionStatus(customerId) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true, isBlocked: true },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const row = await this.prisma.customerCollectionStatus.findUnique({
            where: { customerId },
        });
        if (row)
            return this.toStatusDto(row);
        return {
            customerId,
            status: client_1.CustomerCollectionStatusKind.NORMAL,
            blocked: customer.isBlocked,
            note: null,
            updatedAt: new Date(0).toISOString(),
            updatedById: null,
        };
    }
    async assertNotBlocked(customerId) {
        const status = await this.prisma.customerCollectionStatus.findUnique({
            where: { customerId },
            select: { blocked: true, note: true },
        });
        if (status?.blocked) {
            throw new common_1.ForbiddenException({
                message: 'CUSTOMER_BLOCKED',
                errorCode: 'CUSTOMER_BLOCKED',
                blockReason: status.note ?? 'العميل محظور — يرجى مراجعة مركز الاتصال',
            });
        }
    }
    resolveReportingBounds(fromIso, toIso) {
        const now = new Date();
        const hasFrom = Boolean(fromIso?.trim());
        const hasTo = Boolean(toIso?.trim());
        if (!hasFrom && !hasTo) {
            const epoch = new Date(0);
            return {
                fromIso: epoch.toISOString(),
                toIso: now.toISOString(),
                dateLimited: false,
            };
        }
        const toDate = hasTo ? new Date(toIso) : now;
        const fromDate = hasFrom ? new Date(fromIso) : new Date(0);
        if (Number.isNaN(toDate.getTime()) || Number.isNaN(fromDate.getTime())) {
            throw new common_1.BadRequestException('Invalid from/to ISO date');
        }
        if (fromDate.getTime() > toDate.getTime()) {
            throw new common_1.BadRequestException('`from` must be before `to`');
        }
        return {
            fromIso: fromDate.toISOString(),
            toIso: toDate.toISOString(),
            createdAt: { gte: fromDate, lte: toDate },
            dateLimited: true,
        };
    }
    emptyResponse(fromIso, toIso, totalDueKd = '0.000') {
        return {
            rows: [],
            totalCustomers: 0,
            totalInvoices: 0,
            totalDueKd,
            source: 'COLLECTIONS_ENGINE',
            blockedCount: 0,
            lateCount: 0,
            riskCount: 0,
            generatedAt: new Date().toISOString(),
            fromIso,
            toIso,
        };
    }
    groupByCustomer(rows) {
        const grouped = new Map();
        for (const row of rows) {
            const list = grouped.get(row.customerId) ?? [];
            list.push(row);
            grouped.set(row.customerId, list);
        }
        return grouped;
    }
    applyPostFilters(rows, query) {
        const search = (query.search ?? '').trim().toLowerCase();
        return rows.filter((row) => {
            if (query.status && row.status !== query.status)
                return false;
            if (typeof query.blocked === 'boolean' && row.blocked !== query.blocked) {
                return false;
            }
            if (search) {
                const haystack = [row.name ?? '', row.phone ?? '', row.phone2 ?? '']
                    .join(' ')
                    .toLowerCase();
                if (!haystack.includes(search))
                    return false;
            }
            return true;
        });
    }
    toStatusDto(row) {
        return {
            customerId: row.customerId,
            status: row.status,
            blocked: row.blocked,
            note: row.note,
            updatedAt: row.updatedAt.toISOString(),
            updatedById: row.updatedById,
        };
    }
};
exports.OutstandingService = OutstandingService;
exports.OutstandingService = OutstandingService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => orders_service_1.OrdersService))),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_logs_service_1.AuditLogsService,
        orders_service_1.OrdersService])
], OutstandingService);
function round3Kd(d) {
    return parseFloat(d.toFixed(3));
}
function round4(value) {
    return Math.round(value * 10_000) / 10_000;
}
//# sourceMappingURL=outstanding.service.js.map