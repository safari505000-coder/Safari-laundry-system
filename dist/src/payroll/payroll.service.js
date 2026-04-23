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
const commission_payouts_service_1 = require("../commissions/commission-payouts.service");
const debt_holds_service_1 = require("../debt-holds/debt-holds.service");
const prisma_service_1 = require("../prisma/prisma.service");
function netPay(row) {
    const commission = row.commissionAmount ?? new client_1.Prisma.Decimal(0);
    const hold = row.debtHoldAmount ?? new client_1.Prisma.Decimal(0);
    const release = row.debtReleaseAmount ?? new client_1.Prisma.Decimal(0);
    return row.basicSalary
        .add(row.allowances)
        .add(commission)
        .add(release)
        .sub(row.deductions)
        .sub(hold);
}
let PayrollService = class PayrollService {
    prisma;
    commissionPayouts;
    debtHolds;
    constructor(prisma, commissionPayouts, debtHolds) {
        this.prisma = prisma;
        this.commissionPayouts = commissionPayouts;
        this.debtHolds = debtHolds;
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
        const manualDed = new client_1.Prisma.Decimal((dto.deductions ?? 0).toFixed(4));
        const paymentDate = new Date(dto.paymentDate);
        return this.prisma.$transaction(async (tx) => {
            const totalDed = manualDed;
            const commissionSnapshot = await this.commissionPayouts.sumReleasedForUser(dto.userId, paymentDate);
            const commission = new client_1.Prisma.Decimal(commissionSnapshot.sumKd);
            await this.debtHolds.releaseSettledHolds(dto.userId, tx);
            const debtRelease = new client_1.Prisma.Decimal(0);
            const newHoldSnap = await this.debtHolds.buildHoldSnapshotForPayroll(dto.userId);
            const autoHold = newHoldSnap
                ? newHoldSnap.holdAmount
                : new client_1.Prisma.Decimal(0);
            const untiedHolds = await tx.debtHold.findMany({
                where: {
                    employeeUserId: dto.userId,
                    status: 'HELD',
                    payrollId: null,
                },
                select: { id: true, holdAmount: true },
            });
            const untiedSum = untiedHolds.reduce((acc, h) => acc.add(new client_1.Prisma.Decimal(h.holdAmount.toString())), new client_1.Prisma.Decimal(0));
            const debtHold = autoHold.add(untiedSum);
            const payroll = await tx.payroll.create({
                data: {
                    userId: dto.userId,
                    branchId: dto.branchId,
                    basicSalary: basic,
                    allowances: allow,
                    deductions: totalDed,
                    commissionAmount: commission.toFixed(4),
                    debtHoldAmount: debtHold.toFixed(4),
                    debtReleaseAmount: debtRelease.toFixed(4),
                    paymentDate,
                    status: client_1.PayrollStatus.PENDING,
                },
                include: {
                    user: { select: { id: true, fullName: true, username: true } },
                    branch: { select: { id: true, name: true } },
                },
            });
            if (commissionSnapshot.payoutIds.length > 0) {
                await this.commissionPayouts.markPaidForPayroll(commissionSnapshot.payoutIds, payroll.id, tx);
            }
            if (newHoldSnap) {
                await this.debtHolds.persistHold({
                    employeeUserId: dto.userId,
                    payrollId: payroll.id,
                    debtAmount: newHoldSnap.debtAmount,
                    holdAmount: newHoldSnap.holdAmount,
                    holdMode: newHoldSnap.holdMode,
                }, tx);
            }
            if (untiedHolds.length > 0) {
                await tx.debtHold.updateMany({
                    where: { id: { in: untiedHolds.map((h) => h.id) } },
                    data: { payrollId: payroll.id },
                });
            }
            return payroll;
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
    async findOne(actorRole, actorUserId, id) {
        const row = await this.prisma.payroll.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        username: true,
                        employeeId: true,
                        civilId: true,
                        nationality: true,
                        address: true,
                        bankName: true,
                        bankIban: true,
                        hireDate: true,
                        jobTitle: true,
                    },
                },
                branch: { select: { id: true, name: true, location: true } },
            },
        });
        if (!row)
            throw new common_1.NotFoundException('Payroll not found');
        const canReadAll = actorRole === client_1.SafariRole.OWNER ||
            actorRole === client_1.SafariRole.GENERAL_MANAGER ||
            actorRole === client_1.SafariRole.MANAGER ||
            actorRole === client_1.SafariRole.ACCOUNTANT;
        if (!canReadAll && row.userId !== actorUserId) {
            throw new common_1.ForbiddenException();
        }
        return row;
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
                commissionAmount: true,
                debtHoldAmount: true,
                debtReleaseAmount: true,
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        commission_payouts_service_1.CommissionPayoutsService,
        debt_holds_service_1.DebtHoldsService])
], PayrollService);
//# sourceMappingURL=payroll.service.js.map