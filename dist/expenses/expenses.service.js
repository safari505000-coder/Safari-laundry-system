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
exports.ExpensesService = exports.DRIVER_ONLY_CATEGORIES = void 0;
exports.deriveOwnerType = deriveOwnerType;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const general_ledger_service_1 = require("../general-ledger/general-ledger.service");
const prisma_service_1 = require("../prisma/prisma.service");
const institutional_mutation_util_1 = require("../auth/institutional-mutation.util");
function deriveOwnerType(recordedByRole, branchId) {
    if (recordedByRole === client_1.SafariRole.DRIVER)
        return 'DRIVER';
    if (recordedByRole === client_1.SafariRole.MANAGER)
        return 'BRANCH';
    if (recordedByRole === client_1.SafariRole.OWNER ||
        recordedByRole === client_1.SafariRole.GENERAL_MANAGER ||
        recordedByRole === client_1.SafariRole.ACCOUNTANT) {
        return 'COMPANY';
    }
    return branchId ? 'BRANCH' : 'COMPANY';
}
exports.DRIVER_ONLY_CATEGORIES = new Set([
    client_1.ExpenseCategory.FUEL,
]);
let ExpensesService = class ExpensesService {
    prisma;
    generalLedger;
    constructor(prisma, generalLedger) {
        this.prisma = prisma;
        this.generalLedger = generalLedger;
    }
    assertCanRecordExpense(role) {
        if (role !== client_1.SafariRole.MANAGER && role !== client_1.SafariRole.DRIVER) {
            throw new common_1.ForbiddenException('Only MANAGER or DRIVER can record expenses');
        }
    }
    assertCategoryMatchesRole(role, category) {
        if (role === client_1.SafariRole.MANAGER && exports.DRIVER_ONLY_CATEGORIES.has(category)) {
            throw new common_1.BadRequestException(`INVALID EXPENSE TYPE — category ${category} is driver-only; branch managers cannot record it.`);
        }
    }
    assertOwnershipCoherent(role, branchId) {
        if (role === client_1.SafariRole.MANAGER && !branchId) {
            throw new common_1.BadRequestException('EXPENSE MUST HAVE OWNER — branch manager has no branch attribution.');
        }
    }
    async computeDriverSpendableCash(tx, driverId) {
        const [cashSum, expSum, depSum] = await Promise.all([
            tx.order.aggregate({
                where: {
                    driverId,
                    status: client_1.OrderStatus.COMPLETED,
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                    posPaymentMethod: client_1.PosPaymentMethod.CASH,
                },
                _sum: { totalPrice: true },
            }),
            tx.branchExpense.aggregate({
                where: {
                    recordedById: driverId,
                    status: { in: [client_1.ExpenseStatus.APPROVED, client_1.ExpenseStatus.AUDIT] },
                },
                _sum: { amount: true },
            }),
            tx.deposit.aggregate({
                where: { driverId, status: client_1.DepositStatus.PENDING },
                _sum: { amount: true },
            }),
        ]);
        const cash = new client_1.Prisma.Decimal(cashSum._sum.totalPrice?.toString() ?? '0');
        const exp = new client_1.Prisma.Decimal(expSum._sum.amount?.toString() ?? '0');
        const dep = new client_1.Prisma.Decimal(depSum._sum.amount?.toString() ?? '0');
        return cash.sub(exp).sub(dep);
    }
    async create(userId, safariRole, dto) {
        this.assertCanRecordExpense(safariRole);
        this.assertCategoryMatchesRole(safariRole, dto.category);
        const method = dto.expenseMethod ?? client_1.ExpenseMethod.CASH;
        const amountDec = new client_1.Prisma.Decimal(Number(dto.amount).toFixed(4));
        return this.prisma.$transaction(async (tx) => {
            if (safariRole === client_1.SafariRole.DRIVER && method === client_1.ExpenseMethod.CASH) {
                const spendable = await this.computeDriverSpendableCash(tx, userId);
                if (amountDec.gt(spendable)) {
                    throw new common_1.BadRequestException('Insufficient driver field cash for a CASH expense (includes pending deposits).');
                }
            }
            const u = await tx.user.findUnique({
                where: { id: userId },
                select: { branchId: true },
            });
            this.assertOwnershipCoherent(safariRole, u?.branchId ?? null);
            const row = await tx.branchExpense.create({
                data: {
                    title: dto.title.trim(),
                    amount: amountDec,
                    category: dto.category,
                    expenseMethod: method,
                    status: client_1.ExpenseStatus.PENDING_ACCOUNTANT,
                    note: dto.note?.trim() || null,
                    receiptUrl: dto.receiptUrl?.trim() || null,
                    recordedById: userId,
                    branchId: u?.branchId ?? null,
                },
                include: {
                    recordedBy: {
                        select: { id: true, fullName: true, username: true },
                    },
                    branch: {
                        select: { id: true, name: true },
                    },
                },
            });
            const isDriver = safariRole === client_1.SafariRole.DRIVER;
            const driverWalletDelta = isDriver && method === client_1.ExpenseMethod.CASH ? amountDec.neg() : new client_1.Prisma.Decimal(0);
            const ownerRadarDelta = isDriver && method === client_1.ExpenseMethod.PREPAID_CARD ? amountDec.neg()
                : isDriver && method === client_1.ExpenseMethod.CASH ? amountDec.neg()
                    : amountDec.neg();
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.EXPENSE_RECORDED,
                amount: 0,
                memo: `expense:created:${row.title}`,
                expenseId: row.id,
                actorUserId: userId,
                metadata: {
                    event: 'CREATED',
                    status: client_1.ExpenseStatus.PENDING_ACCOUNTANT,
                    amountKd: amountDec.toString(),
                    category: row.category,
                    expenseMethod: method,
                    safariRole,
                    driverWalletDelta: driverWalletDelta.toString(),
                    ownerProfitRadarDelta: ownerRadarDelta.toString(),
                },
            });
            return {
                ...row,
                receiptUrl: null,
                ownerType: deriveOwnerType(safariRole, row.branchId),
            };
        });
    }
    async listForUser(userId, safariRole, fromIso, toIso, branchId, status) {
        if (safariRole !== client_1.SafariRole.MANAGER &&
            safariRole !== client_1.SafariRole.ACCOUNTANT &&
            safariRole !== client_1.SafariRole.OWNER &&
            safariRole !== client_1.SafariRole.GENERAL_MANAGER &&
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
                    select: { id: true, fullName: true, username: true, safariRole: true },
                },
                branch: {
                    select: { id: true, name: true },
                },
            },
        });
        const canSeeReceipt = safariRole === client_1.SafariRole.OWNER ||
            safariRole === client_1.SafariRole.GENERAL_MANAGER;
        return rows.map((row) => ({
            ...row,
            receiptUrl: canSeeReceipt ? row.receiptUrl : null,
            ownerType: deriveOwnerType(row.recordedBy.safariRole, row.branchId),
        }));
    }
    async listPendingApproval(safariRole) {
        if (safariRole !== client_1.SafariRole.ACCOUNTANT &&
            safariRole !== client_1.SafariRole.OWNER &&
            safariRole !== client_1.SafariRole.GENERAL_MANAGER) {
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
    async updateStatus(id, safariRole, status, actorUserId) {
        (0, institutional_mutation_util_1.assertInstitutionalMutationAllowed)(safariRole);
        if (safariRole !== client_1.SafariRole.ACCOUNTANT &&
            safariRole !== client_1.SafariRole.OWNER) {
            throw new common_1.ForbiddenException();
        }
        return this.prisma.$transaction(async (tx) => {
            const previous = await tx.branchExpense.findUnique({
                where: { id },
                select: { status: true },
            });
            if (!previous) {
                throw new common_1.BadRequestException('Expense not found');
            }
            const previousStatus = previous.status;
            const updated = await tx.branchExpense.update({
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
            let ledgerAmount = 0;
            let event = 'STATUS_CHANGE';
            const wasApproved = previousStatus === client_1.ExpenseStatus.APPROVED;
            const becameApproved = status === client_1.ExpenseStatus.APPROVED;
            if (!wasApproved && becameApproved) {
                ledgerAmount = updated.amount;
                event = 'ACCRUAL';
            }
            else if (wasApproved && !becameApproved) {
                ledgerAmount = updated.amount.neg();
                event = 'REVERSAL';
            }
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.EXPENSE_RECORDED,
                amount: ledgerAmount,
                memo: `expense:${status.toLowerCase()}`,
                expenseId: updated.id,
                actorUserId,
                metadata: {
                    event,
                    status,
                    previousStatus,
                    amountKd: updated.amount.toString(),
                    category: updated.category,
                    expenseMethod: updated.expenseMethod,
                    branchId: updated.branchId,
                },
            });
            return updated;
        });
    }
    branchWhere(branchId) {
        if (!branchId)
            return {};
        return { branchId };
    }
    async sumInRange(from, to, branchId, recordedById) {
        const agg = await this.prisma.branchExpense.aggregate({
            where: {
                expenseDate: { gte: from, lte: to },
                status: client_1.ExpenseStatus.APPROVED,
                ...this.branchWhere(branchId),
                ...(recordedById ? { recordedById } : {}),
            },
            _sum: { amount: true },
        });
        return agg._sum.amount !== null && agg._sum.amount !== undefined
            ? agg._sum.amount.toString()
            : '0';
    }
    async sumInRangeByCategories(from, to, categories, branchId, recordedById) {
        const agg = await this.prisma.branchExpense.aggregate({
            where: {
                expenseDate: { gte: from, lte: to },
                category: { in: categories },
                status: client_1.ExpenseStatus.APPROVED,
                ...this.branchWhere(branchId),
                ...(recordedById ? { recordedById } : {}),
            },
            _sum: { amount: true },
        });
        return agg._sum.amount !== null && agg._sum.amount !== undefined
            ? agg._sum.amount.toString()
            : '0';
    }
    async summarize(fromIso, toIso, branchId) {
        const from = new Date(fromIso);
        const to = new Date(toIso);
        const branchFilter = branchId ? { branchId } : {};
        const rows = await this.prisma.branchExpense.findMany({
            where: {
                expenseDate: { gte: from, lte: to },
                ...branchFilter,
            },
            select: {
                amount: true,
                category: true,
                status: true,
                branchId: true,
                expenseDate: true,
                branch: { select: { name: true } },
                recordedBy: { select: { safariRole: true } },
            },
        });
        let totalApprovedKd = new client_1.Prisma.Decimal(0);
        let totalPendingKd = new client_1.Prisma.Decimal(0);
        let approvedCount = 0;
        const ownerTotals = new Map();
        const categoryTotals = new Map();
        const branchTotals = new Map();
        const monthly = new Map();
        for (const row of rows) {
            const amount = row.amount;
            if (row.status === client_1.ExpenseStatus.APPROVED) {
                totalApprovedKd = totalApprovedKd.add(amount);
                approvedCount += 1;
            }
            else if (row.status === client_1.ExpenseStatus.PENDING_ACCOUNTANT) {
                totalPendingKd = totalPendingKd.add(amount);
            }
            if (row.status !== client_1.ExpenseStatus.APPROVED)
                continue;
            const ownerType = deriveOwnerType(row.recordedBy.safariRole, row.branchId);
            const ownerSlot = ownerTotals.get(ownerType) ?? {
                kd: new client_1.Prisma.Decimal(0),
                count: 0,
            };
            ownerSlot.kd = ownerSlot.kd.add(amount);
            ownerSlot.count += 1;
            ownerTotals.set(ownerType, ownerSlot);
            const categorySlot = categoryTotals.get(row.category) ?? {
                kd: new client_1.Prisma.Decimal(0),
                count: 0,
            };
            categorySlot.kd = categorySlot.kd.add(amount);
            categorySlot.count += 1;
            categoryTotals.set(row.category, categorySlot);
            const branchKey = row.branchId ?? '__unattributed__';
            const branchSlot = branchTotals.get(branchKey) ?? {
                branchId: row.branchId ?? null,
                branchName: row.branch?.name ?? null,
                kd: new client_1.Prisma.Decimal(0),
                count: 0,
            };
            branchSlot.kd = branchSlot.kd.add(amount);
            branchSlot.count += 1;
            branchTotals.set(branchKey, branchSlot);
            const monthKey = row.expenseDate.toISOString().slice(0, 7);
            const monthSlot = monthly.get(monthKey) ?? {
                total: new client_1.Prisma.Decimal(0),
                driver: new client_1.Prisma.Decimal(0),
                branch: new client_1.Prisma.Decimal(0),
                company: new client_1.Prisma.Decimal(0),
            };
            monthSlot.total = monthSlot.total.add(amount);
            if (ownerType === 'DRIVER')
                monthSlot.driver = monthSlot.driver.add(amount);
            else if (ownerType === 'BRANCH')
                monthSlot.branch = monthSlot.branch.add(amount);
            else
                monthSlot.company = monthSlot.company.add(amount);
            monthly.set(monthKey, monthSlot);
        }
        const byOwnerType = ['DRIVER', 'BRANCH', 'COMPANY'].map((ownerType) => {
            const slot = ownerTotals.get(ownerType);
            return {
                ownerType,
                totalKd: (slot?.kd ?? new client_1.Prisma.Decimal(0)).toFixed(4),
                count: slot?.count ?? 0,
            };
        });
        const byCategory = [...categoryTotals.entries()]
            .map(([category, slot]) => ({
            category,
            totalKd: slot.kd.toFixed(4),
            count: slot.count,
        }))
            .sort((a, b) => Number(b.totalKd) - Number(a.totalKd));
        const byBranch = [...branchTotals.values()]
            .map((slot) => ({
            branchId: slot.branchId,
            branchName: slot.branchName,
            totalKd: slot.kd.toFixed(4),
            count: slot.count,
        }))
            .sort((a, b) => Number(b.totalKd) - Number(a.totalKd));
        const monthlyOut = [...monthly.entries()]
            .map(([month, slot]) => ({
            month,
            totalKd: slot.total.toFixed(4),
            driverKd: slot.driver.toFixed(4),
            branchKd: slot.branch.toFixed(4),
            companyKd: slot.company.toFixed(4),
        }))
            .sort((a, b) => a.month.localeCompare(b.month));
        const alerts = this.buildSummaryAlerts(monthlyOut, totalApprovedKd);
        return {
            source: 'api/finance/expenses-summary',
            rangeFromIso: from.toISOString(),
            rangeToIso: to.toISOString(),
            branchScope: branchId ?? null,
            totalApprovedKd: totalApprovedKd.toFixed(4),
            totalPendingKd: totalPendingKd.toFixed(4),
            approvedCount,
            byOwnerType,
            byCategory,
            byBranch,
            monthly: monthlyOut,
            alerts,
        };
    }
    buildSummaryAlerts(monthly, totalApproved) {
        const alerts = [];
        if (monthly.length >= 2) {
            const last = monthly[monthly.length - 1];
            const prev = monthly[monthly.length - 2];
            const lastTotal = new client_1.Prisma.Decimal(last.totalKd);
            const prevTotal = new client_1.Prisma.Decimal(prev.totalKd);
            if (prevTotal.gt(0)) {
                const growth = lastTotal.sub(prevTotal).div(prevTotal);
                if (growth.gt(0.75)) {
                    alerts.push({
                        id: 'expenses-monthly-spike',
                        severity: 'critical',
                        message: `Monthly expenses spiked +${growth.mul(100).toFixed(0)}% (${prev.month} → ${last.month}).`,
                    });
                }
                else if (growth.gt(0.3)) {
                    alerts.push({
                        id: 'expenses-monthly-growth',
                        severity: 'warning',
                        message: `Monthly expenses grew +${growth.mul(100).toFixed(0)}% (${prev.month} → ${last.month}).`,
                    });
                }
                else if (growth.lt(-0.5)) {
                    alerts.push({
                        id: 'expenses-monthly-drop',
                        severity: 'info',
                        message: `Monthly expenses dropped ${growth.mul(100).toFixed(0)}% (${prev.month} → ${last.month}).`,
                    });
                }
            }
        }
        if (totalApproved.lte(0)) {
            alerts.push({
                id: 'expenses-empty-window',
                severity: 'info',
                message: 'No approved expenses in the selected window.',
            });
        }
        return alerts;
    }
};
exports.ExpensesService = ExpensesService;
exports.ExpensesService = ExpensesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        general_ledger_service_1.GeneralLedgerService])
], ExpensesService);
//# sourceMappingURL=expenses.service.js.map