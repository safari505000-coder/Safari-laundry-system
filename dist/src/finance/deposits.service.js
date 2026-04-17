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
exports.DepositsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const debt_service_1 = require("./services/debt.service");
let DepositsService = class DepositsService {
    prisma;
    debtService;
    constructor(prisma, debtService) {
        this.prisma = prisma;
        this.debtService = debtService;
    }
    async listForUser(userId, role, query) {
        const nameQ = query.driverName?.trim();
        const where = {
            ...(query.status ? { status: query.status } : {}),
            ...(query.driverId ? { driverId: query.driverId } : {}),
            ...(nameQ ?
                {
                    driver: {
                        fullName: { contains: nameQ, mode: 'insensitive' },
                    },
                }
                : {}),
        };
        if (role === client_1.SafariRole.DRIVER) {
            where.driverId = userId;
            delete where.driver;
        }
        const rows = await this.prisma.deposit.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 500,
            include: {
                driver: {
                    select: {
                        id: true,
                        fullName: true,
                        username: true,
                        branchId: true,
                    },
                },
                auditedBy: {
                    select: { id: true, fullName: true, username: true },
                },
            },
        });
        return {
            rows: rows.map((r) => ({
                id: r.id,
                driverId: r.driverId,
                driverName: r.driver.fullName,
                amount: r.amount.toString(),
                type: r.type,
                receiptImage: r.receiptImage,
                status: r.status,
                auditComment: r.auditComment,
                auditedBy: r.auditedBy ?? null,
                createdAt: r.createdAt.toISOString(),
                updatedAt: r.updatedAt.toISOString(),
            })),
        };
    }
    async createByDriver(driverId, amount, type, receiptImageUrl) {
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new common_1.BadRequestException('amount must be positive');
        }
        const driver = await this.prisma.user.findUnique({
            where: { id: driverId },
            select: { id: true, safariRole: true },
        });
        if (!driver || driver.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.BadRequestException('Only DRIVER can create deposit request');
        }
        const row = await this.prisma.deposit.create({
            data: {
                driverId,
                amount: new client_1.Prisma.Decimal(amount.toFixed(4)),
                type,
                receiptImage: receiptImageUrl,
                status: client_1.DepositStatus.PENDING,
            },
            include: {
                driver: {
                    select: {
                        id: true,
                        fullName: true,
                        username: true,
                        branchId: true,
                    },
                },
            },
        });
        return {
            id: row.id,
            driverId: row.driverId,
            driverName: row.driver.fullName,
            amount: row.amount.toString(),
            type: row.type,
            receiptImage: row.receiptImage,
            status: row.status,
            auditComment: row.auditComment,
            auditedBy: null,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
        };
    }
    async updateStatus(auditorId, id, dto) {
        const row = await this.prisma.deposit.findUnique({
            where: { id },
            include: {
                driver: {
                    select: { id: true, safariRole: true, branchId: true },
                },
            },
        });
        if (!row)
            throw new common_1.NotFoundException('Deposit not found');
        if (row.status !== client_1.DepositStatus.PENDING) {
            throw new common_1.BadRequestException('Only pending deposits can be updated');
        }
        const next = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.deposit.update({
                where: { id },
                data: {
                    status: dto.status,
                    auditComment: dto.auditComment?.trim() || null,
                    auditedById: auditorId,
                },
            });
            if (dto.status === client_1.DepositStatus.APPROVED) {
                const amountNum = Number.parseFloat(updated.amount.toString());
                await this.debtService.applyDriverDepositSettlement(row.driverId, amountNum);
                const branchId = row.driver.branchId;
                if (branchId) {
                    const existing = await tx.wallet.findFirst({
                        where: { branchId, currency: 'KWD' },
                        select: { id: true, balance: true },
                    });
                    if (existing) {
                        await tx.wallet.update({
                            where: { id: existing.id },
                            data: {
                                balance: existing.balance.add(new client_1.Prisma.Decimal(amountNum.toFixed(4))),
                            },
                        });
                    }
                    else {
                        await tx.wallet.create({
                            data: {
                                branchId,
                                currency: 'KWD',
                                balance: new client_1.Prisma.Decimal(amountNum.toFixed(4)),
                            },
                        });
                    }
                }
            }
            return updated;
        });
        return {
            id: next.id,
            status: next.status,
            auditComment: next.auditComment,
            updatedAt: next.updatedAt.toISOString(),
        };
    }
};
exports.DepositsService = DepositsService;
exports.DepositsService = DepositsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        debt_service_1.DebtService])
], DepositsService);
//# sourceMappingURL=deposits.service.js.map