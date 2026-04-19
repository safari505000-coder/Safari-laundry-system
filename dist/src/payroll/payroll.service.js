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
exports.PayrollService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
function netPay(row) {
    return row.basicSalary.add(row.allowances).sub(row.deductions);
}
let PayrollService = class PayrollService {
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
    async create(actorRole, dto) {
        this.assertOwnerOrManager(actorRole);
        const basic = new client_1.Prisma.Decimal(dto.basicSalary.toFixed(4));
        const allow = new client_1.Prisma.Decimal((dto.allowances ?? 0).toFixed(4));
        const ded = new client_1.Prisma.Decimal((dto.deductions ?? 0).toFixed(4));
        return this.prisma.payroll.create({
            data: {
                userId: dto.userId,
                branchId: dto.branchId,
                basicSalary: basic,
                allowances: allow,
                deductions: ded,
                paymentDate: new Date(dto.paymentDate),
                status: client_1.PayrollStatus.PENDING,
            },
            include: {
                user: { select: { id: true, fullName: true, username: true } },
                branch: { select: { id: true, name: true } },
            },
        });
    }
    async markPaid(actorRole, id) {
        this.assertOwnerOrManager(actorRole);
        const row = await this.prisma.payroll.findUnique({ where: { id } });
        if (!row)
            throw new common_1.NotFoundException('Payroll not found');
        return this.prisma.payroll.update({
            where: { id },
            data: { status: client_1.PayrollStatus.PAID, paymentDate: new Date() },
            include: {
                user: { select: { id: true, fullName: true, username: true } },
                branch: { select: { id: true, name: true } },
            },
        });
    }
    async list(actorRole, fromIso, toIso, branchId) {
        if (actorRole !== client_1.SafariRole.OWNER &&
            actorRole !== client_1.SafariRole.GENERAL_MANAGER &&
            actorRole !== client_1.SafariRole.MANAGER &&
            actorRole !== client_1.SafariRole.ACCOUNTANT) {
            throw new common_1.ForbiddenException();
        }
        const from = new Date(fromIso);
        const to = new Date(toIso);
        return this.prisma.payroll.findMany({
            where: {
                paymentDate: { gte: from, lte: to },
                ...(branchId ? { branchId } : {}),
            },
            orderBy: { paymentDate: 'desc' },
            include: {
                user: { select: { id: true, fullName: true, username: true } },
                branch: { select: { id: true, name: true } },
            },
        });
    }
    async sumPaidNetInRange(from, to, branchId) {
        const rows = await this.prisma.payroll.findMany({
            where: {
                status: client_1.PayrollStatus.PAID,
                paymentDate: { gte: from, lte: to },
                ...(branchId ? { branchId } : {}),
            },
            select: {
                basicSalary: true,
                allowances: true,
                deductions: true,
            },
        });
        let total = new client_1.Prisma.Decimal(0);
        for (const r of rows) {
            total = total.add(netPay(r));
        }
        return total.toFixed(4);
    }
};
exports.PayrollService = PayrollService;
exports.PayrollService = PayrollService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PayrollService);
//# sourceMappingURL=payroll.service.js.map