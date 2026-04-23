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
exports.LoansService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const LOAN_INCLUDE = {
    user: {
        select: {
            id: true,
            fullName: true,
            username: true,
            employeeId: true,
            civilId: true,
            jobTitle: true,
            branch: { select: { id: true, name: true } },
        },
    },
    approvedBy: {
        select: { id: true, fullName: true, username: true },
    },
};
function isApprover(role) {
    return (role === client_1.SafariRole.OWNER ||
        role === client_1.SafariRole.GENERAL_MANAGER ||
        role === client_1.SafariRole.ACCOUNTANT);
}
let LoansService = class LoansService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(actorRole, actorUserId, dto) {
        if (dto.installmentCount < 1) {
            throw new common_1.BadRequestException('installmentCount must be >= 1');
        }
        const amount = new client_1.Prisma.Decimal(dto.amount.toFixed(4));
        const monthly = amount.div(dto.installmentCount).toDecimalPlaces(4);
        const targetUserId = isApprover(actorRole)
            ? dto.userId ?? actorUserId
            : actorUserId;
        return this.prisma.employeeLoan.create({
            data: {
                userId: targetUserId,
                amount,
                installmentCount: dto.installmentCount,
                monthlyDeduction: monthly,
                remaining: amount,
                reason: dto.reason ?? null,
                status: client_1.LoanStatus.PENDING,
            },
            include: LOAN_INCLUDE,
        });
    }
    async list(actorRole, actorUserId, q) {
        const where = {
            ...(q.status ? { status: q.status } : {}),
            ...(q.userId ? { userId: q.userId } : {}),
        };
        if (!isApprover(actorRole)) {
            where.userId = actorUserId;
        }
        return this.prisma.employeeLoan.findMany({
            where,
            include: LOAN_INCLUDE,
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
    }
    async listMine(actorUserId) {
        return this.prisma.employeeLoan.findMany({
            where: { userId: actorUserId },
            include: LOAN_INCLUDE,
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(actorRole, actorUserId, id) {
        const row = await this.prisma.employeeLoan.findUnique({
            where: { id },
            include: LOAN_INCLUDE,
        });
        if (!row)
            throw new common_1.NotFoundException('Loan not found');
        if (!isApprover(actorRole) && row.userId !== actorUserId) {
            throw new common_1.ForbiddenException();
        }
        return row;
    }
    async approve(actorRole, actorUserId, id) {
        if (!isApprover(actorRole))
            throw new common_1.ForbiddenException();
        const current = await this.prisma.employeeLoan.findUnique({
            where: { id },
        });
        if (!current)
            throw new common_1.NotFoundException('Loan not found');
        if (current.status !== client_1.LoanStatus.PENDING) {
            throw new common_1.BadRequestException('Only PENDING loans can be approved');
        }
        return this.prisma.employeeLoan.update({
            where: { id },
            data: {
                status: client_1.LoanStatus.ACTIVE,
                approvedById: actorUserId,
                approvedAt: new Date(),
            },
            include: LOAN_INCLUDE,
        });
    }
    async reject(actorRole, actorUserId, id, reason) {
        if (!isApprover(actorRole))
            throw new common_1.ForbiddenException();
        const current = await this.prisma.employeeLoan.findUnique({
            where: { id },
        });
        if (!current)
            throw new common_1.NotFoundException('Loan not found');
        if (current.status !== client_1.LoanStatus.PENDING) {
            throw new common_1.BadRequestException('Only PENDING loans can be rejected');
        }
        return this.prisma.employeeLoan.update({
            where: { id },
            data: {
                status: client_1.LoanStatus.REJECTED,
                approvedById: actorUserId,
                approvedAt: new Date(),
                rejectedReason: reason,
            },
            include: LOAN_INCLUDE,
        });
    }
    async deductManual(actorRole, loanId, amountKd, note) {
        if (actorRole !== client_1.SafariRole.OWNER &&
            actorRole !== client_1.SafariRole.GENERAL_MANAGER) {
            throw new common_1.ForbiddenException('Manual loan deductions are OWNER / GM only');
        }
        if (!Number.isFinite(amountKd) || amountKd <= 0) {
            throw new common_1.BadRequestException('Amount must be a positive number');
        }
        const requested = new client_1.Prisma.Decimal(amountKd.toFixed(4));
        return this.prisma.$transaction(async (tx) => {
            const loan = await tx.employeeLoan.findUnique({ where: { id: loanId } });
            if (!loan)
                throw new common_1.NotFoundException('Loan not found');
            if (loan.status !== client_1.LoanStatus.ACTIVE) {
                throw new common_1.BadRequestException('Only ACTIVE loans can be deducted manually');
            }
            const deduction = client_1.Prisma.Decimal.min(requested, loan.remaining);
            if (deduction.lte(0)) {
                throw new common_1.BadRequestException('Loan already settled');
            }
            const nextRemaining = loan.remaining.sub(deduction);
            const nextStatus = nextRemaining.lte(0)
                ? client_1.LoanStatus.SETTLED
                : loan.status;
            const trailLine = `\n\n[${new Date().toISOString().slice(0, 10)}] خصم يدوي ${deduction.toFixed(3)} د.ك${note ? ` — ${note.slice(0, 200)}` : ''}`;
            const nextReason = (loan.reason ?? '') + trailLine;
            return tx.employeeLoan.update({
                where: { id: loan.id },
                data: {
                    remaining: nextRemaining,
                    status: nextStatus,
                    reason: nextReason,
                },
                include: LOAN_INCLUDE,
            });
        });
    }
};
exports.LoansService = LoansService;
exports.LoansService = LoansService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LoansService);
//# sourceMappingURL=loans.service.js.map