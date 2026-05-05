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
exports.LedgerProjectionService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
const DEC_ZERO = new client_1.Prisma.Decimal(0);
function toFixed4(d) {
    return d.toFixed(4);
}
function pair(txId, createdAt, debitAccount, creditAccount, amount, meta) {
    if (amount.lessThanOrEqualTo(0)) {
        return [];
    }
    const iso = createdAt.toISOString();
    return [
        {
            txId,
            id: `${txId}:DR:0`,
            accountId: debitAccount,
            debit: toFixed4(amount),
            credit: toFixed4(DEC_ZERO),
            createdAt: iso,
            meta,
        },
        {
            txId,
            id: `${txId}:CR:0`,
            accountId: creditAccount,
            debit: toFixed4(DEC_ZERO),
            credit: toFixed4(amount),
            createdAt: iso,
            meta,
        },
    ];
}
let LedgerProjectionService = class LedgerProjectionService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async project(input) {
        const from = new Date(input.fromIso);
        const to = new Date(input.toIso);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new Error('Invalid date range');
        }
        const entries = [];
        const posRows = await this.prisma.generalLedgerEntry.findMany({
            where: {
                entryType: client_1.GeneralLedgerEntryType.POS_SALE_COMPLETED,
                createdAt: { gte: from, lte: to },
            },
            select: {
                id: true,
                amount: true,
                actorUserId: true,
                orderId: true,
                customerId: true,
                metadata: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });
        const cashActorIds = [
            ...new Set(posRows
                .filter((r) => {
                const meta = (r.metadata ?? {});
                return (String(meta.posPaymentMethod ?? '') === client_1.PosPaymentMethod.CASH &&
                    !!r.actorUserId);
            })
                .map((r) => r.actorUserId)),
        ];
        const actorRoleById = new Map();
        if (cashActorIds.length) {
            const actors = await this.prisma.user.findMany({
                where: { id: { in: cashActorIds } },
                select: { id: true, safariRole: true },
            });
            for (const u of actors)
                actorRoleById.set(u.id, u.safariRole);
        }
        for (const r of posRows) {
            const amount = new client_1.Prisma.Decimal(r.amount.toString());
            if (amount.lessThanOrEqualTo(0))
                continue;
            const meta = (r.metadata ?? {});
            const method = String(meta.posPaymentMethod ?? '');
            let debitAccount;
            if (method === client_1.PosPaymentMethod.CASH) {
                if (!r.actorUserId) {
                    debitAccount = 'UNATTRIBUTED';
                }
                else {
                    const role = actorRoleById.get(r.actorUserId) ?? null;
                    if (role === client_1.SafariRole.DRIVER) {
                        debitAccount = `DRIVER_${r.actorUserId}`;
                    }
                    else if (role === client_1.SafariRole.MANAGER) {
                        debitAccount = `MANAGER_${r.actorUserId}`;
                    }
                    else if (role === null) {
                        debitAccount = 'UNATTRIBUTED';
                    }
                    else {
                        debitAccount = 'COMPANY_CASH';
                    }
                }
            }
            else if (method === client_1.PosPaymentMethod.KNET ||
                method === client_1.PosPaymentMethod.PAYMENT_LINK ||
                method === client_1.PosPaymentMethod.ONLINE) {
                debitAccount = 'BANK_ACCOUNT';
            }
            else if (method === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT ||
                method === client_1.PosPaymentMethod.SUBSCRIPTION_WALLET) {
                debitAccount = 'COMPANY_CASH';
            }
            else {
                debitAccount = 'UNATTRIBUTED';
            }
            entries.push(...pair(`gl:${r.id}`, r.createdAt, debitAccount, 'REVENUE_POS', amount, {
                source: 'GeneralLedgerEntry',
                entryType: 'POS_SALE_COMPLETED',
                posPaymentMethod: method || null,
                actorRole: r.actorUserId
                    ? actorRoleById.get(r.actorUserId) ?? null
                    : null,
                orderId: r.orderId,
                customerId: r.customerId,
                actorUserId: r.actorUserId,
            }));
        }
        const expenseRows = await this.prisma.generalLedgerEntry.findMany({
            where: {
                entryType: client_1.GeneralLedgerEntryType.EXPENSE_RECORDED,
                createdAt: { gte: from, lte: to },
                amount: { gt: 0 },
            },
            select: {
                id: true,
                amount: true,
                actorUserId: true,
                expenseId: true,
                metadata: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });
        const expenseIds = expenseRows
            .map((r) => r.expenseId)
            .filter((x) => !!x);
        const expensesById = new Map();
        if (expenseIds.length) {
            const exp = await this.prisma.branchExpense.findMany({
                where: { id: { in: expenseIds } },
                select: { id: true, branchId: true, recordedById: true },
            });
            for (const e of exp) {
                expensesById.set(e.id, {
                    branchId: e.branchId,
                    recordedById: e.recordedById,
                });
            }
            const recorderIds = [...new Set(exp.map((e) => e.recordedById))];
            const recorders = await this.prisma.user.findMany({
                where: { id: { in: recorderIds } },
                select: { id: true, safariRole: true },
            });
            const recorderRole = new Map(recorders.map((u) => [u.id, u.safariRole]));
            for (const r of expenseRows) {
                const amount = new client_1.Prisma.Decimal(r.amount.toString());
                if (amount.lessThanOrEqualTo(0))
                    continue;
                const meta = (r.metadata ?? {});
                const category = String(meta.category ?? 'MISC');
                const expense = r.expenseId ? expensesById.get(r.expenseId) : null;
                const role = expense ? recorderRole.get(expense.recordedById) : null;
                let creditAccount;
                if (role === 'DRIVER' && expense) {
                    creditAccount = `DRIVER_${expense.recordedById}`;
                }
                else if (role === 'MANAGER' && expense) {
                    creditAccount = `MANAGER_${expense.recordedById}`;
                }
                else {
                    creditAccount = 'COMPANY_CASH';
                }
                entries.push(...pair(`gl:${r.id}`, r.createdAt, `EXPENSE_${category}`, creditAccount, amount, {
                    source: 'GeneralLedgerEntry',
                    entryType: 'EXPENSE_RECORDED',
                    expenseId: r.expenseId,
                    actorUserId: r.actorUserId,
                    recorderRole: role ?? null,
                    event: meta.event ?? null,
                }));
            }
        }
        const custodies = await this.prisma.managerCashCustody.findMany({
            where: { receivedFromDriverAt: { gte: from, lte: to } },
            select: {
                id: true,
                managerId: true,
                driverId: true,
                branchId: true,
                amountKd: true,
                receivedFromDriverAt: true,
                verifiedAt: true,
                status: true,
            },
            orderBy: { receivedFromDriverAt: 'asc' },
        });
        for (const c of custodies) {
            const amount = new client_1.Prisma.Decimal(c.amountKd.toString());
            if (amount.lessThanOrEqualTo(0))
                continue;
            entries.push(...pair(`mch:${c.id}:HANDOVER`, c.receivedFromDriverAt, `MANAGER_${c.managerId}`, `DRIVER_${c.driverId}`, amount, {
                source: 'ManagerCashCustody',
                event: 'HANDOVER',
                custodyId: c.id,
                branchId: c.branchId,
                status: c.status,
            }));
        }
        const verified = await this.prisma.managerCashCustody.findMany({
            where: {
                status: client_1.ManagerCashCustodyStatus.VERIFIED,
                verifiedAt: { gte: from, lte: to, not: null },
            },
            select: {
                id: true,
                managerId: true,
                amountKd: true,
                verifiedAt: true,
                branchId: true,
            },
            orderBy: { verifiedAt: 'asc' },
        });
        for (const c of verified) {
            const amount = new client_1.Prisma.Decimal(c.amountKd.toString());
            if (amount.lessThanOrEqualTo(0) || !c.verifiedAt)
                continue;
            entries.push(...pair(`mch:${c.id}:VERIFIED`, c.verifiedAt, 'BANK_ACCOUNT', `MANAGER_${c.managerId}`, amount, {
                source: 'ManagerCashCustody',
                event: 'VERIFIED',
                custodyId: c.id,
                branchId: c.branchId,
            }));
        }
        entries.sort((a, b) => {
            if (a.createdAt !== b.createdAt) {
                return a.createdAt < b.createdAt ? -1 : 1;
            }
            if (a.txId !== b.txId)
                return a.txId < b.txId ? -1 : 1;
            return a.id < b.id ? -1 : 1;
        });
        return entries;
    }
    aggregateAccounts(entries) {
        const acc = new Map();
        for (const e of entries) {
            const cur = acc.get(e.accountId) ?? {
                debit: new client_1.Prisma.Decimal(0),
                credit: new client_1.Prisma.Decimal(0),
                count: 0,
            };
            cur.debit = cur.debit.plus(new client_1.Prisma.Decimal(e.debit));
            cur.credit = cur.credit.plus(new client_1.Prisma.Decimal(e.credit));
            cur.count += 1;
            acc.set(e.accountId, cur);
        }
        return [...acc.entries()]
            .map(([accountId, v]) => ({
            accountId,
            totalDebit: toFixed4(v.debit),
            totalCredit: toFixed4(v.credit),
            balance: toFixed4(v.debit.minus(v.credit)),
            entryCount: v.count,
        }))
            .sort((a, b) => a.accountId.localeCompare(b.accountId));
    }
    reconcile(entries, fromIso, toIso) {
        let globalDebit = new client_1.Prisma.Decimal(0);
        let globalCredit = new client_1.Prisma.Decimal(0);
        const txs = new Map();
        let unattributed = 0;
        for (const e of entries) {
            globalDebit = globalDebit.plus(new client_1.Prisma.Decimal(e.debit));
            globalCredit = globalCredit.plus(new client_1.Prisma.Decimal(e.credit));
            const cur = txs.get(e.txId) ?? {
                debit: new client_1.Prisma.Decimal(0),
                credit: new client_1.Prisma.Decimal(0),
            };
            cur.debit = cur.debit.plus(new client_1.Prisma.Decimal(e.debit));
            cur.credit = cur.credit.plus(new client_1.Prisma.Decimal(e.credit));
            txs.set(e.txId, cur);
            if (e.accountId === 'UNATTRIBUTED')
                unattributed += 1;
        }
        const unbalanced = [];
        for (const [txId, v] of txs) {
            const delta = v.debit.minus(v.credit);
            if (!delta.isZero()) {
                unbalanced.push({
                    txId,
                    debit: toFixed4(v.debit),
                    credit: toFixed4(v.credit),
                    delta: toFixed4(delta),
                });
            }
        }
        return {
            status: unbalanced.length === 0 && globalDebit.equals(globalCredit)
                ? 'PASS'
                : 'FAIL',
            fromIso,
            toIso,
            totalEntries: entries.length,
            totalTransactions: txs.size,
            globalDebit: toFixed4(globalDebit),
            globalCredit: toFixed4(globalCredit),
            unbalancedTransactions: unbalanced,
            unattributedEntries: unattributed,
            generatedAt: new Date().toISOString(),
        };
    }
};
exports.LedgerProjectionService = LedgerProjectionService;
exports.LedgerProjectionService = LedgerProjectionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LedgerProjectionService);
//# sourceMappingURL=ledger-projection.service.js.map