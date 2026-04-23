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
exports.ManagerDocumentsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let ManagerDocumentsService = class ManagerDocumentsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listForManager(managerId, branchId) {
        const verifiedBags = await this.prisma.managerCashCustody.findMany({
            where: {
                managerId,
                status: client_1.ManagerCashCustodyStatus.VERIFIED,
            },
            select: {
                id: true,
                amountKd: true,
                verifiedAt: true,
                receivedFromDriverAt: true,
                status: true,
                branch: { select: { name: true } },
                driver: { select: { fullName: true } },
            },
            orderBy: { verifiedAt: 'desc' },
            take: 200,
        });
        const branchExpenseWhere = {
            status: client_1.ExpenseStatus.APPROVED,
            OR: [
                { recordedById: managerId },
                ...(branchId ? [{ branchId }] : []),
            ],
        };
        const approvedExpenses = await this.prisma.branchExpense.findMany({
            where: branchExpenseWhere,
            select: {
                id: true,
                title: true,
                amount: true,
                category: true,
                note: true,
                expenseDate: true,
                updatedAt: true,
                status: true,
                branch: { select: { name: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 200,
        });
        const custodyRows = verifiedBags.map((b) => ({
            kind: 'CUSTODY_RECEIPT',
            id: b.id,
            date: (b.verifiedAt ?? b.receivedFromDriverAt).toISOString(),
            amountKd: b.amountKd.toString(),
            title: 'سند استلام عهدة نقدية',
            subtitle: [b.branch?.name, b.driver?.fullName].filter(Boolean).join(' · ') ||
                null,
            status: b.status,
            printPath: `/my-cash-receipts/${b.id}/print`,
        }));
        const expenseRows = approvedExpenses.map((e) => ({
            kind: 'EXPENSE_VOUCHER',
            id: e.id,
            date: (e.updatedAt ?? e.expenseDate).toISOString(),
            amountKd: e.amount.toString(),
            title: e.title || 'سند مصروف معتمد',
            subtitle: [e.branch?.name, e.category, e.note].filter(Boolean).join(' · ') ||
                null,
            status: e.status,
            printPath: `/my-documents/expense/${e.id}/print`,
        }));
        return [...custodyRows, ...expenseRows].sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    }
    async getExpenseVoucherForManager(expenseId, managerId, branchId) {
        const row = await this.prisma.branchExpense.findFirst({
            where: {
                id: expenseId,
                status: client_1.ExpenseStatus.APPROVED,
                OR: [
                    { recordedById: managerId },
                    ...(branchId ? [{ branchId }] : []),
                ],
            },
            include: {
                recordedBy: {
                    select: { id: true, fullName: true, username: true },
                },
                branch: { select: { id: true, name: true } },
            },
        });
        return row;
    }
};
exports.ManagerDocumentsService = ManagerDocumentsService;
exports.ManagerDocumentsService = ManagerDocumentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ManagerDocumentsService);
//# sourceMappingURL=manager-documents.service.js.map