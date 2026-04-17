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
exports.ExpensesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let ExpensesService = class ExpensesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    assertCanRecordExpense(role) {
        if (role !== client_1.SafariRole.MANAGER && role !== client_1.SafariRole.DRIVER) {
            throw new common_1.ForbiddenException('Only MANAGER or DRIVER can record expenses');
        }
    }
    async create(userId, safariRole, dto) {
        this.assertCanRecordExpense(safariRole);
        const u = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { branchId: true },
        });
        return this.prisma.branchExpense.create({
            data: {
                title: dto.title.trim(),
                amount: dto.amount.toFixed(4),
                category: dto.category,
                status: client_1.ExpenseStatus.PENDING_ACCOUNTANT,
                note: dto.note?.trim() || null,
                receiptUrl: dto.receiptUrl?.trim() || null,
                recordedById: userId,
                branchId: u?.branchId ?? null,
            },
        });
    }
    async listForUser(userId, safariRole, fromIso, toIso, branchId, status) {
        if (safariRole !== client_1.SafariRole.MANAGER &&
            safariRole !== client_1.SafariRole.ACCOUNTANT &&
            safariRole !== client_1.SafariRole.OWNER &&
            safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.ForbiddenException();
        }
        const from = new Date(fromIso);
        const to = new Date(toIso);
        const driverOwn = safariRole === client_1.SafariRole.DRIVER ? { recordedById: userId } : {};
        const rows = await this.prisma.branchExpense.findMany({
            where: {
                expenseDate: { gte: from, lte: to },
                ...(safariRole === client_1.SafariRole.DRIVER ? driverOwn : {}),
                ...(safariRole !== client_1.SafariRole.DRIVER && branchId ? { branchId } : {}),
                ...(status ? { status } : {}),
            },
            orderBy: { expenseDate: 'desc' },
            include: {
                recordedBy: {
                    select: { id: true, fullName: true, username: true },
                },
                branch: {
                    select: { id: true, name: true },
                },
            },
        });
        return rows.map((row) => ({ ...row, receiptUrl: null }));
    }
    async listPendingApproval(safariRole) {
        if (safariRole !== client_1.SafariRole.ACCOUNTANT && safariRole !== client_1.SafariRole.OWNER) {
            throw new common_1.ForbiddenException();
        }
        return this.prisma.branchExpense.findMany({
            where: { status: client_1.ExpenseStatus.PENDING_ACCOUNTANT },
            orderBy: { expenseDate: 'desc' },
            include: {
                recordedBy: {
                    select: { id: true, fullName: true, username: true },
                },
                branch: {
                    select: { id: true, name: true },
                },
            },
        });
    }
    async updateStatus(id, safariRole, status) {
        if (safariRole !== client_1.SafariRole.ACCOUNTANT && safariRole !== client_1.SafariRole.OWNER) {
            throw new common_1.ForbiddenException();
        }
        return this.prisma.branchExpense.update({
            where: { id },
            data: { status },
            include: {
                recordedBy: {
                    select: { id: true, fullName: true, username: true },
                },
                branch: {
                    select: { id: true, name: true },
                },
            },
        });
    }
    branchWhere(branchId) {
        if (!branchId)
            return {};
        return { branchId };
    }
    async sumInRange(from, to, branchId) {
        const agg = await this.prisma.branchExpense.aggregate({
            where: {
                expenseDate: { gte: from, lte: to },
                status: client_1.ExpenseStatus.APPROVED,
                ...this.branchWhere(branchId),
            },
            _sum: { amount: true },
        });
        return agg._sum.amount !== null && agg._sum.amount !== undefined
            ? agg._sum.amount.toString()
            : '0';
    }
    async sumInRangeByCategories(from, to, categories, branchId) {
        const agg = await this.prisma.branchExpense.aggregate({
            where: {
                expenseDate: { gte: from, lte: to },
                category: { in: categories },
                status: client_1.ExpenseStatus.APPROVED,
                ...this.branchWhere(branchId),
            },
            _sum: { amount: true },
        });
        return agg._sum.amount !== null && agg._sum.amount !== undefined
            ? agg._sum.amount.toString()
            : '0';
    }
};
exports.ExpensesService = ExpensesService;
exports.ExpensesService = ExpensesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ExpensesService);
//# sourceMappingURL=expenses.service.js.map