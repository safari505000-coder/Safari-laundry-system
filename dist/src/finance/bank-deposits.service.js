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
exports.BankDepositsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const general_ledger_service_1 = require("../general-ledger/general-ledger.service");
const prisma_service_1 = require("../prisma/prisma.service");
let BankDepositsService = class BankDepositsService {
    prisma;
    generalLedger;
    constructor(prisma, generalLedger) {
        this.prisma = prisma;
        this.generalLedger = generalLedger;
    }
    async list(q) {
        const take = q.take ?? 100;
        const to = q.to ? new Date(q.to) : new Date();
        const from = q.from ?
            new Date(q.from)
            : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new common_1.BadRequestException('Invalid date range');
        }
        const rows = await this.prisma.bankDepositLog.findMany({
            where: { createdAt: { gte: from, lte: to } },
            take,
            orderBy: { createdAt: 'desc' },
            include: {
                uploadedBy: {
                    select: { id: true, fullName: true, username: true },
                },
                verifiedByAccountant: {
                    select: { id: true, fullName: true, username: true },
                },
            },
        });
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            entries: rows.map((r) => ({
                id: r.id,
                depositType: r.depositType,
                amountKd: r.amountKd.toString(),
                receiptImageUrl: r.receiptImageUrl,
                shiftId: r.shiftId,
                createdAt: r.createdAt.toISOString(),
                verifiedAt: r.verifiedAt?.toISOString() ?? null,
                uploadedBy: r.uploadedBy,
                verifiedByAccountant: r.verifiedByAccountant,
            })),
        };
    }
    async createFromUpload(managerId, fileUrl, depositType, amountKd, shiftId) {
        if (!Number.isFinite(amountKd) || amountKd < 0) {
            throw new common_1.BadRequestException('Invalid amount');
        }
        if (shiftId) {
            const shift = await this.prisma.shift.findUnique({
                where: { id: shiftId },
            });
            if (!shift) {
                throw new common_1.NotFoundException('Shift not found');
            }
        }
        const row = await this.prisma.bankDepositLog.create({
            data: {
                depositType,
                amountKd: new client_1.Prisma.Decimal(amountKd.toFixed(4)),
                receiptImageUrl: fileUrl,
                shiftId: shiftId ?? null,
                uploadedById: managerId,
            },
            include: {
                uploadedBy: {
                    select: { id: true, fullName: true, username: true },
                },
                verifiedByAccountant: {
                    select: { id: true, fullName: true, username: true },
                },
            },
        });
        return this.mapOne(row);
    }
    async verify(accountantId, id) {
        const row = await this.prisma.bankDepositLog.findUnique({ where: { id } });
        if (!row) {
            throw new common_1.NotFoundException('Deposit log entry not found');
        }
        if (row.verifiedByAccountantId) {
            throw new common_1.BadRequestException('Already verified by accountant');
        }
        const updated = await this.prisma.$transaction(async (tx) => {
            const next = await tx.bankDepositLog.update({
                where: { id },
                data: {
                    verifiedByAccountantId: accountantId,
                    verifiedAt: new Date(),
                },
                include: {
                    uploadedBy: {
                        select: { id: true, fullName: true, username: true },
                    },
                    verifiedByAccountant: {
                        select: { id: true, fullName: true, username: true },
                    },
                },
            });
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.WALLET_SETTLEMENT,
                amount: 0,
                memo: `bank-deposit:${next.depositType.toLowerCase()}:verified`,
                actorUserId: accountantId,
                metadata: {
                    source: 'BANK_DEPOSIT_LOG',
                    bankDepositLogId: next.id,
                    depositType: next.depositType,
                    amountKd: next.amountKd.toString(),
                    receiptImageUrl: next.receiptImageUrl,
                    shiftId: next.shiftId,
                    uploadedById: next.uploadedById,
                },
            });
            return next;
        });
        return this.mapOne(updated);
    }
    mapOne(row) {
        return {
            id: row.id,
            depositType: row.depositType,
            amountKd: row.amountKd.toString(),
            receiptImageUrl: row.receiptImageUrl,
            shiftId: row.shiftId,
            createdAt: row.createdAt.toISOString(),
            verifiedAt: row.verifiedAt?.toISOString() ?? null,
            uploadedBy: row.uploadedBy,
            verifiedByAccountant: row.verifiedByAccountant,
        };
    }
};
exports.BankDepositsService = BankDepositsService;
exports.BankDepositsService = BankDepositsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        general_ledger_service_1.GeneralLedgerService])
], BankDepositsService);
//# sourceMappingURL=bank-deposits.service.js.map