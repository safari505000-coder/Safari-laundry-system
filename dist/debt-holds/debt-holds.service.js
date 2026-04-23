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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebtHoldsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const system_settings_service_1 = require("../system-settings/system-settings.service");
let DebtHoldsService = class DebtHoldsService {
    prisma;
    systemSettings;
    constructor(prisma, systemSettings) {
        this.prisma = prisma;
        this.systemSettings = systemSettings;
    }
    assertAdmin(role) {
        const ok = role === client_1.SafariRole.OWNER ||
            role === client_1.SafariRole.GENERAL_MANAGER ||
            role === client_1.SafariRole.ACCOUNTANT ||
            role === client_1.SafariRole.MANAGER;
        if (!ok)
            throw new common_1.ForbiddenException();
    }
    async computeOpenDebtForEmployee(employeeUserId) {
        const orders = await this.prisma.order.findMany({
            where: {
                OR: [
                    { driverId: employeeUserId },
                    { transferredFromDriverId: employeeUserId },
                ],
            },
            select: { id: true },
        });
        if (orders.length === 0) {
            return { debt: new client_1.Prisma.Decimal(0), debtKd: '0.0000' };
        }
        const orderIds = orders.map((o) => o.id);
        const ledger = await this.prisma.debtLedgerEntry.findMany({
            where: { orderId: { in: orderIds } },
            select: {
                orderId: true,
                source: true,
                amount: true,
            },
        });
        const perOrder = new Map();
        for (const e of ledger) {
            if (!e.orderId)
                continue;
            const row = perOrder.get(e.orderId) ?? {
                created: new client_1.Prisma.Decimal(0),
                paid: new client_1.Prisma.Decimal(0),
            };
            const amt = new client_1.Prisma.Decimal(e.amount.toString()).abs();
            if (e.source === client_1.DebtSource.PAYMENT) {
                row.paid = row.paid.add(amt);
            }
            else {
                row.created = row.created.add(amt);
            }
            perOrder.set(e.orderId, row);
        }
        let total = new client_1.Prisma.Decimal(0);
        for (const row of perOrder.values()) {
            const open = row.created.sub(row.paid);
            if (open.greaterThan(0))
                total = total.add(open);
        }
        return { debt: total, debtKd: total.toFixed(4) };
    }
    async buildHoldSnapshotForPayroll(employeeUserId) {
        const policy = await this.systemSettings.getDebtHoldPolicy();
        if (!policy.isActive)
            return null;
        const { debt } = await this.computeOpenDebtForEmployee(employeeUserId);
        if (debt.isZero() || debt.isNegative())
            return null;
        let hold;
        if (policy.holdMode === client_1.DebtHoldMode.FIXED && policy.fixedAmount) {
            const ceiling = new client_1.Prisma.Decimal(policy.fixedAmount.toString());
            hold = client_1.Prisma.Decimal.min(debt, ceiling);
        }
        else {
            hold = debt;
        }
        return {
            debtAmount: debt,
            holdAmount: hold,
            holdMode: policy.holdMode,
        };
    }
    async persistHold(data, tx) {
        const db = tx ?? this.prisma;
        return db.debtHold.create({
            data: {
                employeeUserId: data.employeeUserId,
                payrollId: data.payrollId,
                debtAmount: data.debtAmount.toFixed(4),
                holdAmount: data.holdAmount.toFixed(4),
                note: `Auto-hold at payroll cut (${data.holdMode})`,
            },
        });
    }
    async releaseSettledHolds(employeeUserId, tx) {
        const db = tx ?? this.prisma;
        const helds = await db.debtHold.findMany({
            where: { employeeUserId, status: client_1.DebtHoldStatus.HELD },
            select: { id: true, holdAmount: true, releasedAmount: true },
        });
        if (helds.length === 0) {
            return { releaseKd: '0.0000', releasedIds: [] };
        }
        const { debt } = await this.computeOpenDebtForEmployee(employeeUserId);
        let leftToCover = debt;
        let released = new client_1.Prisma.Decimal(0);
        const releasedIds = [];
        const helds2 = [...helds].sort((a, b) => a.id.localeCompare(b.id));
        for (const h of helds2) {
            const hold = new client_1.Prisma.Decimal(h.holdAmount.toString());
            const already = new client_1.Prisma.Decimal(h.releasedAmount.toString());
            const remaining = hold.sub(already);
            if (remaining.lessThanOrEqualTo(0))
                continue;
            if (leftToCover.greaterThanOrEqualTo(remaining)) {
                leftToCover = leftToCover.sub(remaining);
                continue;
            }
            const freeable = remaining.sub(leftToCover);
            leftToCover = new client_1.Prisma.Decimal(0);
            released = released.add(freeable);
            const newReleased = already.add(freeable);
            const allReleased = newReleased.greaterThanOrEqualTo(hold);
            await db.debtHold.update({
                where: { id: h.id },
                data: {
                    releasedAmount: newReleased.toFixed(4),
                    status: allReleased ? client_1.DebtHoldStatus.RELEASED : client_1.DebtHoldStatus.HELD,
                    releaseDate: allReleased ? new Date() : null,
                },
            });
            releasedIds.push(h.id);
        }
        return { releaseKd: released.toFixed(4), releasedIds };
    }
    async list(actorRole, actorUserId, dto) {
        const adminRoles = [
            client_1.SafariRole.OWNER,
            client_1.SafariRole.GENERAL_MANAGER,
            client_1.SafariRole.ACCOUNTANT,
            client_1.SafariRole.MANAGER,
        ];
        const isAdmin = adminRoles.includes(actorRole);
        const where = {
            ...(dto.status ? { status: dto.status } : {}),
            ...(dto.from || dto.to
                ? {
                    createdAt: {
                        ...(dto.from ? { gte: new Date(dto.from) } : {}),
                        ...(dto.to ? { lte: new Date(dto.to) } : {}),
                    },
                }
                : {}),
            ...(isAdmin
                ? dto.employeeUserId
                    ? { employeeUserId: dto.employeeUserId }
                    : {}
                : { employeeUserId: actorUserId }),
        };
        return this.prisma.debtHold.findMany({
            where,
            include: {
                employee: { select: { id: true, fullName: true, username: true } },
                payroll: { select: { id: true, paymentDate: true, status: true } },
                disbursedBy: { select: { id: true, fullName: true, username: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async createManualHold(actorRole, dto) {
        if (actorRole !== client_1.SafariRole.OWNER &&
            actorRole !== client_1.SafariRole.GENERAL_MANAGER) {
            throw new common_1.ForbiddenException('Only OWNER/GM may create manual holds');
        }
        if (dto.holdAmount <= 0) {
            throw new common_1.ForbiddenException('holdAmount must be > 0');
        }
        const amount = new client_1.Prisma.Decimal(dto.holdAmount.toFixed(4));
        if (!dto.payrollId) {
            return this.prisma.debtHold.create({
                data: {
                    employeeUserId: dto.employeeUserId,
                    debtAmount: amount.toFixed(4),
                    holdAmount: amount.toFixed(4),
                    note: dto.note?.trim() || 'Manual hold (admin-initiated)',
                },
                include: {
                    employee: { select: { id: true, fullName: true, username: true } },
                },
            });
        }
        return this.prisma.$transaction(async (tx) => {
            const payroll = await tx.payroll.findUnique({
                where: { id: dto.payrollId },
                select: {
                    id: true,
                    userId: true,
                    debtHoldAmount: true,
                    status: true,
                },
            });
            if (!payroll) {
                throw new common_1.ForbiddenException('Payroll not found');
            }
            if (payroll.userId !== dto.employeeUserId) {
                throw new common_1.ForbiddenException('Payroll does not belong to this employee');
            }
            const hold = await tx.debtHold.create({
                data: {
                    employeeUserId: dto.employeeUserId,
                    payrollId: payroll.id,
                    debtAmount: amount.toFixed(4),
                    holdAmount: amount.toFixed(4),
                    note: dto.note?.trim() || 'Manual hold (admin-initiated)',
                },
                include: {
                    employee: { select: { id: true, fullName: true, username: true } },
                },
            });
            const current = new client_1.Prisma.Decimal((payroll.debtHoldAmount ?? 0).toString());
            await tx.payroll.update({
                where: { id: payroll.id },
                data: { debtHoldAmount: current.add(amount).toFixed(4) },
            });
            return hold;
        });
    }
    async releaseManualHold(actorRole, id) {
        if (actorRole !== client_1.SafariRole.OWNER &&
            actorRole !== client_1.SafariRole.GENERAL_MANAGER) {
            throw new common_1.ForbiddenException('Only OWNER/GM may release holds');
        }
        const row = await this.prisma.debtHold.findUnique({ where: { id } });
        if (!row) {
            throw new common_1.ForbiddenException('Hold not found');
        }
        if (row.status === client_1.DebtHoldStatus.RELEASED) {
            return row;
        }
        const hold = new client_1.Prisma.Decimal(row.holdAmount.toString());
        return this.prisma.debtHold.update({
            where: { id },
            data: {
                status: client_1.DebtHoldStatus.RELEASED,
                releasedAmount: hold.toFixed(4),
                releaseDate: new Date(),
            },
            include: {
                employee: { select: { id: true, fullName: true, username: true } },
            },
        });
    }
    async markDisbursed(actorRole, actorUserId, id) {
        if (actorRole !== client_1.SafariRole.OWNER &&
            actorRole !== client_1.SafariRole.GENERAL_MANAGER) {
            throw new common_1.ForbiddenException('Only OWNER/GM may disburse holds');
        }
        const row = await this.prisma.debtHold.findUnique({ where: { id } });
        if (!row) {
            throw new common_1.ForbiddenException('Hold not found');
        }
        if (row.status !== client_1.DebtHoldStatus.RELEASED) {
            throw new common_1.ForbiddenException('Hold must be RELEASED before it can be disbursed');
        }
        if (row.disbursedAt) {
            return row;
        }
        return this.prisma.debtHold.update({
            where: { id },
            data: {
                disbursedAt: new Date(),
                disbursedById: actorUserId,
            },
            include: {
                employee: { select: { id: true, fullName: true, username: true } },
                disbursedBy: { select: { id: true, fullName: true, username: true } },
            },
        });
    }
    async previewForEmployee(actorRole, employeeUserId) {
        this.assertAdmin(actorRole);
        const snap = await this.buildHoldSnapshotForPayroll(employeeUserId);
        if (!snap) {
            return {
                isPolicyActive: (await this.systemSettings.getDebtHoldPolicy())
                    .isActive,
                debtKd: '0.0000',
                holdKd: '0.0000',
                holdMode: null,
            };
        }
        return {
            isPolicyActive: true,
            debtKd: snap.debtAmount.toFixed(4),
            holdKd: snap.holdAmount.toFixed(4),
            holdMode: snap.holdMode,
        };
    }
};
exports.DebtHoldsService = DebtHoldsService;
exports.DebtHoldsService = DebtHoldsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        system_settings_service_1.SystemSettingsService])
], DebtHoldsService);
//# sourceMappingURL=debt-holds.service.js.map