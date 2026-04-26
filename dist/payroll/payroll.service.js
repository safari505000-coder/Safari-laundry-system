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
const loans_service_1 = require("../loans/loans.service");
const prisma_service_1 = require("../prisma/prisma.service");
function netPay(row) {
    const commission = row.commissionAmount ?? new client_1.Prisma.Decimal(0);
    const hold = row.debtHoldAmount ?? new client_1.Prisma.Decimal(0);
    const release = row.debtReleaseAmount ?? new client_1.Prisma.Decimal(0);
    const loan = row.loanDeduction ?? new client_1.Prisma.Decimal(0);
    return row.basicSalary
        .add(row.allowances)
        .add(commission)
        .add(release)
        .sub(row.deductions)
        .sub(hold)
        .sub(loan);
}
function yearMonthOf(d) {
    return d.toISOString().slice(0, 7);
}
let PayrollService = class PayrollService {
    prisma;
    commissionPayouts;
    debtHolds;
    loans;
    constructor(prisma, commissionPayouts, debtHolds, loans) {
        this.prisma = prisma;
        this.commissionPayouts = commissionPayouts;
        this.debtHolds = debtHolds;
        this.loans = loans;
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
        const yearMonth = yearMonthOf(paymentDate);
        return this.prisma.$transaction(async (tx) => {
            const totalDed = manualDed;
            const loanDeduction = await this.loans.bookPayrollInstalmentsFor(dto.userId, yearMonth, tx);
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
                    loanDeduction: loanDeduction.toFixed(4),
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
    async recalcLoanDeduction(actorRole, id) {
        this.assertOwnerOrManager(actorRole);
        return this.prisma.$transaction(async (tx) => {
            const row = await tx.payroll.findUnique({ where: { id } });
            if (!row)
                throw new common_1.NotFoundException('Payroll not found');
            if (row.status !== client_1.PayrollStatus.PENDING) {
                throw new common_1.ForbiddenException('Only PENDING payrolls can be recalculated');
            }
            const yearMonth = yearMonthOf(row.paymentDate);
            const newlyBooked = await this.loans.recalcUnbookedInstalmentsFor(row.userId, yearMonth, tx);
            if (newlyBooked.lte(0)) {
                return tx.payroll.findUniqueOrThrow({
                    where: { id },
                    include: {
                        user: { select: { id: true, fullName: true, username: true } },
                        branch: { select: { id: true, name: true } },
                    },
                });
            }
            const nextLoan = row.loanDeduction.add(newlyBooked);
            return tx.payroll.update({
                where: { id },
                data: { loanDeduction: nextLoan },
                include: {
                    user: { select: { id: true, fullName: true, username: true } },
                    branch: { select: { id: true, name: true } },
                },
            });
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
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        username: true,
                        payrollRosterLineOrder: true,
                        bankIban: true,
                    },
                },
                branch: {
                    select: { id: true, name: true, payrollRosterSortOrder: true },
                },
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
                loanDeduction: true,
            },
        });
        let total = new client_1.Prisma.Decimal(0);
        for (const r of rows) {
            total = total.add(netPay(r));
        }
        return total.toFixed(4);
    }
    async listAdHocLines(actorRole, periodYm, branchId) {
        if (actorRole !== client_1.SafariRole.OWNER &&
            actorRole !== client_1.SafariRole.GENERAL_MANAGER &&
            actorRole !== client_1.SafariRole.MANAGER &&
            actorRole !== client_1.SafariRole.ACCOUNTANT) {
            throw new common_1.ForbiddenException();
        }
        if (!/^\d{4}-\d{2}$/.test(periodYm)) {
            throw new common_1.BadRequestException('Invalid ym');
        }
        return this.prisma.payrollAdHocLine.findMany({
            where: {
                periodYm,
                ...(branchId ? { branchId } : {}),
            },
            orderBy: [{ branchId: 'asc' }, { lineSort: 'asc' }, { createdAt: 'asc' }],
            include: {
                branch: { select: { id: true, name: true } },
            },
        });
    }
    async createAdHocLine(actorRole, dto) {
        this.assertOwnerOrManager(actorRole);
        if (!/^\d{4}-\d{2}$/.test(dto.periodYm)) {
            throw new common_1.BadRequestException('Invalid periodYm');
        }
        const iban = dto.bankIban?.replace(/\s/g, '').trim();
        const bankName = dto.bankName?.trim();
        return this.prisma.payrollAdHocLine.create({
            data: {
                branchId: dto.branchId,
                periodYm: dto.periodYm,
                lineSort: dto.lineSort ?? 0,
                beneficiaryName: dto.beneficiaryName.trim(),
                bankName: bankName && bankName.length > 0 ? bankName : null,
                bankIban: iban && iban.length > 0 ? iban : null,
                basicSalary: new client_1.Prisma.Decimal(dto.basicSalary.toFixed(4)),
                allowances: new client_1.Prisma.Decimal((dto.allowances ?? 0).toFixed(4)),
                deductions: new client_1.Prisma.Decimal((dto.deductions ?? 0).toFixed(4)),
                note: dto.note?.trim() || null,
            },
            include: {
                branch: { select: { id: true, name: true } },
            },
        });
    }
    async updateAdHocLine(actorRole, id, dto) {
        this.assertOwnerOrManager(actorRole);
        const existing = await this.prisma.payrollAdHocLine.findUnique({
            where: { id },
        });
        if (!existing)
            throw new common_1.NotFoundException('Ad-hoc line not found');
        const data = {};
        if (dto.beneficiaryName !== undefined) {
            data.beneficiaryName = dto.beneficiaryName.trim();
        }
        if (dto.bankName !== undefined) {
            const v = dto.bankName?.trim();
            data.bankName = v && v.length > 0 ? v : null;
        }
        if (dto.bankIban !== undefined) {
            const raw = dto.bankIban?.replace(/\s/g, '').trim();
            data.bankIban = raw && raw.length > 0 ? raw : null;
        }
        if (dto.basicSalary !== undefined) {
            data.basicSalary = new client_1.Prisma.Decimal(dto.basicSalary.toFixed(4));
        }
        if (dto.allowances !== undefined) {
            data.allowances = new client_1.Prisma.Decimal(dto.allowances.toFixed(4));
        }
        if (dto.deductions !== undefined) {
            data.deductions = new client_1.Prisma.Decimal(dto.deductions.toFixed(4));
        }
        if (dto.lineSort !== undefined) {
            data.lineSort = dto.lineSort;
        }
        if (dto.note !== undefined) {
            data.note = dto.note?.trim() || null;
        }
        return this.prisma.payrollAdHocLine.update({
            where: { id },
            data,
            include: {
                branch: { select: { id: true, name: true } },
            },
        });
    }
    async deleteAdHocLine(actorRole, id) {
        this.assertOwnerOrManager(actorRole);
        try {
            await this.prisma.payrollAdHocLine.delete({ where: { id } });
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                e.code === 'P2025') {
                throw new common_1.NotFoundException('Ad-hoc line not found');
            }
            throw e;
        }
        return { id, deleted: true };
    }
};
exports.PayrollService = PayrollService;
exports.PayrollService = PayrollService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        commission_payouts_service_1.CommissionPayoutsService,
        debt_holds_service_1.DebtHoldsService,
        loans_service_1.LoansService])
], PayrollService);
//# sourceMappingURL=payroll.service.js.map