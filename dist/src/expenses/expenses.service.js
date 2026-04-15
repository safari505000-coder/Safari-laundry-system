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
    assertCanManage(role) {
        if (role !== client_1.SafariRole.MANAGER && role !== client_1.SafariRole.OWNER) {
            throw new common_1.ForbiddenException('Only MANAGER or OWNER can record expenses');
        }
    }
    async create(userId, safariRole, dto) {
        this.assertCanManage(safariRole);
        const u = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { branchId: true },
        });
        return this.prisma.branchExpense.create({
            data: {
                title: dto.title.trim(),
                amount: dto.amount.toFixed(4),
                category: dto.category,
                note: dto.note?.trim() || null,
                receiptImageData: dto.receiptImageData?.trim() || null,
                recordedById: userId,
                branchId: u?.branchId ?? null,
            },
        });
    }
    async listForUser(_userId, safariRole, fromIso, toIso, branchId) {
        if (safariRole !== client_1.SafariRole.MANAGER && safariRole !== client_1.SafariRole.OWNER) {
            throw new common_1.ForbiddenException();
        }
        const from = new Date(fromIso);
        const to = new Date(toIso);
        return this.prisma.branchExpense.findMany({
            where: {
                expenseDate: { gte: from, lte: to },
                ...(branchId ? { branchId } : {}),
            },
            orderBy: { expenseDate: 'desc' },
            include: {
                recordedBy: {
                    select: { id: true, fullName: true, username: true },
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