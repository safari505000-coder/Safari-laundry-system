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
exports.CommissionPayoutsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let CommissionPayoutsService = class CommissionPayoutsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(actorRole, actorUserId, dto) {
        const adminRoles = [
            client_1.SafariRole.OWNER,
            client_1.SafariRole.GENERAL_MANAGER,
            client_1.SafariRole.ACCOUNTANT,
            client_1.SafariRole.MANAGER,
        ];
        const isAdmin = adminRoles.includes(actorRole);
        const earnerFilter = isAdmin
            ? dto.earnerUserId
                ? { earnerUserId: dto.earnerUserId }
                : {}
            : { earnerUserId: actorUserId };
        const from = new Date(dto.from);
        const to = new Date(dto.to);
        const rows = await this.prisma.commissionPayout.findMany({
            where: {
                earnedAt: { gte: from, lte: to },
                ...(dto.status ? { status: dto.status } : {}),
                ...earnerFilter,
            },
            include: {
                rule: {
                    select: {
                        id: true,
                        name: true,
                        mode: true,
                        percentage: true,
                        payoutTiming: true,
                        calculationBase: true,
                    },
                },
                earner: { select: { id: true, fullName: true, username: true } },
                sourceOrder: {
                    select: { id: true, serialNumber: true, invoiceNumber: true },
                },
            },
            orderBy: { earnedAt: 'desc' },
        });
        const totalsMap = new Map();
        for (const r of rows) {
            const bucket = totalsMap.get(r.earnerUserId) ??
                {
                    [client_1.CommissionPayoutStatus.PENDING]: new client_1.Prisma.Decimal(0),
                    [client_1.CommissionPayoutStatus.RELEASED]: new client_1.Prisma.Decimal(0),
                    [client_1.CommissionPayoutStatus.PAID]: new client_1.Prisma.Decimal(0),
                    [client_1.CommissionPayoutStatus.CANCELLED]: new client_1.Prisma.Decimal(0),
                };
            bucket[r.status] = bucket[r.status].add(r.amount);
            totalsMap.set(r.earnerUserId, bucket);
        }
        const totals = [...totalsMap.entries()].map(([earnerUserId, b]) => ({
            earnerUserId,
            pendingKd: b.PENDING.toFixed(4),
            releasedKd: b.RELEASED.toFixed(4),
            paidKd: b.PAID.toFixed(4),
            cancelledKd: b.CANCELLED.toFixed(4),
        }));
        return { rows, totals };
    }
    async sumReleasedForUser(earnerUserId, asOf) {
        const rows = await this.prisma.commissionPayout.findMany({
            where: {
                earnerUserId,
                status: client_1.CommissionPayoutStatus.RELEASED,
                releasedAt: { lte: asOf },
            },
            select: { id: true, amount: true },
        });
        let sum = new client_1.Prisma.Decimal(0);
        for (const r of rows)
            sum = sum.add(r.amount);
        return { sumKd: sum.toFixed(4), payoutIds: rows.map((r) => r.id) };
    }
    async markPaidForPayroll(payoutIds, payrollId, tx) {
        if (payoutIds.length === 0)
            return 0;
        const db = tx ?? this.prisma;
        const res = await db.commissionPayout.updateMany({
            where: {
                id: { in: payoutIds },
                status: client_1.CommissionPayoutStatus.RELEASED,
            },
            data: {
                status: client_1.CommissionPayoutStatus.PAID,
                paidAt: new Date(),
                payrollId,
            },
        });
        return res.count;
    }
    assertAdmin(role) {
        const ok = role === client_1.SafariRole.OWNER ||
            role === client_1.SafariRole.GENERAL_MANAGER ||
            role === client_1.SafariRole.ACCOUNTANT ||
            role === client_1.SafariRole.MANAGER;
        if (!ok)
            throw new common_1.ForbiddenException();
    }
};
exports.CommissionPayoutsService = CommissionPayoutsService;
exports.CommissionPayoutsService = CommissionPayoutsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CommissionPayoutsService);
//# sourceMappingURL=commission-payouts.service.js.map