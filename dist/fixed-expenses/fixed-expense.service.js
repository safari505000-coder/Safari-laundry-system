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
exports.FixedExpenseService = void 0;
exports.countAccruedMonths = countAccruedMonths;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
function countAccruedMonths(rangeFrom, rangeTo, effFrom, effTo) {
    const capEnd = effTo ?? new Date(Date.UTC(2100, 11, 31));
    const start = new Date(Math.max(rangeFrom.getTime(), effFrom.getTime()));
    const end = new Date(Math.min(rangeTo.getTime(), capEnd.getTime()));
    if (start > end)
        return 0;
    let count = 0;
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const endMonth = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
    while (cursor.getTime() <= endMonth) {
        const monthStart = new Date(cursor);
        const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        const overlapStart = monthStart > start ? monthStart : start;
        const overlapEnd = monthEnd < end ? monthEnd : end;
        if (overlapStart <= overlapEnd)
            count++;
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return count;
}
let FixedExpenseService = class FixedExpenseService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    assertOwnerOrManager(role) {
        if (role !== client_1.SafariRole.OWNER &&
            role !== client_1.SafariRole.GENERAL_MANAGER &&
            role !== client_1.SafariRole.MANAGER) {
            throw new common_1.ForbiddenException();
        }
    }
    async create(role, dto) {
        this.assertOwnerOrManager(role);
        return this.prisma.fixedExpenseSchedule.create({
            data: {
                branchId: dto.branchId,
                title: dto.title.trim(),
                category: dto.category,
                monthlyAmount: new client_1.Prisma.Decimal(dto.monthlyAmount.toFixed(4)),
                effectiveFrom: dto.effectiveFrom
                    ? new Date(dto.effectiveFrom)
                    : new Date(),
                effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
            },
        });
    }
    async list(branchId) {
        return this.prisma.fixedExpenseSchedule.findMany({
            where: {
                ...(branchId ? { branchId } : {}),
            },
            orderBy: [{ branchId: 'asc' }, { title: 'asc' }],
            include: { branch: { select: { id: true, name: true } } },
        });
    }
    async sumAccruedInRange(from, to, branchId) {
        const rows = await this.prisma.fixedExpenseSchedule.findMany({
            where: {
                isActive: true,
                ...(branchId ? { branchId } : {}),
            },
        });
        let total = new client_1.Prisma.Decimal(0);
        for (const r of rows) {
            const months = countAccruedMonths(from, to, r.effectiveFrom, r.effectiveTo);
            if (months <= 0)
                continue;
            const amt = r.monthlyAmount.mul(months);
            total = total.add(amt);
        }
        return total.toFixed(4);
    }
};
exports.FixedExpenseService = FixedExpenseService;
exports.FixedExpenseService = FixedExpenseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FixedExpenseService);
//# sourceMappingURL=fixed-expense.service.js.map