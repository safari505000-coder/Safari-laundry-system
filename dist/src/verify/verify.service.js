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
exports.VerifyService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let VerifyService = class VerifyService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async verifyPayslip(id) {
        const row = await this.prisma.payroll.findUnique({
            where: { id },
            include: {
                user: {
                    select: { fullName: true, username: true, employeeId: true },
                },
                branch: { select: { name: true } },
            },
        });
        if (!row)
            throw new common_1.NotFoundException('Payslip not found');
        const net = row.basicSalary.add(row.allowances).sub(row.deductions);
        return {
            docType: 'payslip',
            docId: row.id,
            valid: true,
            issuedAtIso: row.createdAt.toISOString(),
            issuedTo: {
                fullName: row.user.fullName,
                username: row.user.username,
                employeeId: row.user.employeeId,
            },
            summary: {
                paymentDateIso: row.paymentDate.toISOString(),
                status: row.status,
                netPayKd: net.toFixed(3),
                branch: row.branch?.name ?? null,
            },
        };
    }
    async verifyLeave(id) {
        const row = await this.prisma.leaveRequest.findUnique({
            where: { id },
            include: {
                user: {
                    select: { fullName: true, username: true, employeeId: true },
                },
            },
        });
        if (!row)
            throw new common_1.NotFoundException('Leave request not found');
        return {
            docType: 'leave_request',
            docId: row.id,
            valid: true,
            issuedAtIso: row.createdAt.toISOString(),
            issuedTo: {
                fullName: row.user.fullName,
                username: row.user.username,
                employeeId: row.user.employeeId,
            },
            summary: {
                type: row.type,
                startDate: row.startDate.toISOString().slice(0, 10),
                endDate: row.endDate.toISOString().slice(0, 10),
                daysCount: row.daysCount,
                status: row.status,
            },
        };
    }
    async verifyStatement(id) {
        const row = await this.prisma.customer.findUnique({
            where: { id },
            select: {
                id: true,
                displayName: true,
                phone: true,
                createdAt: true,
                wallet: {
                    select: {
                        balance: true,
                        debt: true,
                        subscriptionPlanName: true,
                        subscriptionExpiresAt: true,
                    },
                },
            },
        });
        if (!row)
            throw new common_1.NotFoundException('Customer not found');
        return {
            docType: 'statement',
            docId: row.id,
            valid: true,
            issuedAtIso: new Date().toISOString(),
            issuedTo: {
                fullName: row.displayName ?? '—',
                username: row.phone ?? '—',
                employeeId: null,
            },
            summary: {
                walletBalanceKd: row.wallet?.balance.toFixed(3) ?? '0.000',
                walletDebtKd: row.wallet?.debt.toFixed(3) ?? '0.000',
                activePlan: row.wallet?.subscriptionPlanName ?? null,
                activePlanExpiresIso: row.wallet?.subscriptionExpiresAt?.toISOString() ?? null,
            },
        };
    }
    async verifyLoan(id) {
        const row = await this.prisma.employeeLoan.findUnique({
            where: { id },
            include: {
                user: {
                    select: { fullName: true, username: true, employeeId: true },
                },
            },
        });
        if (!row)
            throw new common_1.NotFoundException('Loan not found');
        return {
            docType: 'employee_loan',
            docId: row.id,
            valid: true,
            issuedAtIso: row.createdAt.toISOString(),
            issuedTo: {
                fullName: row.user.fullName,
                username: row.user.username,
                employeeId: row.user.employeeId,
            },
            summary: {
                amountKd: row.amount.toFixed(3),
                installmentCount: row.installmentCount,
                monthlyDeductionKd: row.monthlyDeduction.toFixed(3),
                remainingKd: row.remaining.toFixed(3),
                status: row.status,
            },
        };
    }
};
exports.VerifyService = VerifyService;
exports.VerifyService = VerifyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], VerifyService);
//# sourceMappingURL=verify.service.js.map