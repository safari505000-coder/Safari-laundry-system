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
exports.DoubleEntryJournalService = exports.JOURNAL_ACCOUNTS = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
exports.JOURNAL_ACCOUNTS = {
    CASH: '1100',
    BANK_KNET: '1200',
    BANK_ONLINE: '1210',
    ACCOUNTS_RECEIVABLE: '1300',
    REVENUE: '4100',
    ADJUSTMENTS: '5100',
};
let DoubleEntryJournalService = class DoubleEntryJournalService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async appendBalanced(db, input) {
        if (!input.actorUserId)
            throw new Error('JOURNAL_ACTOR_REQUIRED');
        if (!input.sourceRef?.trim())
            throw new Error('JOURNAL_SOURCE_REF_REQUIRED');
        if (input.lines.length < 2)
            throw new Error('JOURNAL_MINIMUM_TWO_LINES');
        const existing = await db.journalEntry.findUnique({
            where: { sourceRef: input.sourceRef },
            select: { id: true },
        });
        if (existing)
            return existing;
        const normalized = input.lines.map((line) => ({
            ...line,
            debit: this.decimal(line.debit ?? 0),
            credit: this.decimal(line.credit ?? 0),
        }));
        let totalDebit = new client_1.Prisma.Decimal(0);
        let totalCredit = new client_1.Prisma.Decimal(0);
        for (const line of normalized) {
            if (line.debit.lessThan(0) || line.credit.lessThan(0)) {
                throw new Error('NEGATIVE_JOURNAL_LINE');
            }
            if (line.debit.gt(0) && line.credit.gt(0)) {
                throw new Error('AMBIGUOUS_JOURNAL_LINE');
            }
            if (line.debit.equals(0) && line.credit.equals(0)) {
                throw new Error('EMPTY_JOURNAL_LINE');
            }
            totalDebit = totalDebit.add(line.debit);
            totalCredit = totalCredit.add(line.credit);
        }
        if (totalDebit.sub(totalCredit).abs().gt(new client_1.Prisma.Decimal('0.001'))) {
            throw new Error('UNBALANCED_JOURNAL');
        }
        const accounts = await db.account.findMany({
            where: {
                code: { in: normalized.map((line) => line.accountCode) },
                isActive: true,
            },
            select: { id: true, code: true },
        });
        const accountIdByCode = new Map(accounts.map((a) => [a.code, a.id]));
        for (const line of normalized) {
            if (!accountIdByCode.has(line.accountCode)) {
                throw new Error(`JOURNAL_ACCOUNT_NOT_FOUND:${line.accountCode}`);
            }
        }
        return db.journalEntry.create({
            data: {
                source: input.source,
                sourceRef: input.sourceRef,
                actorUserId: input.actorUserId,
                customerId: input.customerId ?? null,
                orderId: input.orderId ?? null,
                lines: {
                    create: normalized.map((line) => ({
                        accountId: accountIdByCode.get(line.accountCode),
                        debit: line.debit,
                        credit: line.credit,
                        ...(line.meta !== undefined ? { meta: line.meta } : {}),
                    })),
                },
            },
            select: { id: true },
        });
    }
    async mirrorDebtLedgerEntry(db, input) {
        if (!input.actorUserId)
            throw new Error('JOURNAL_ACTOR_REQUIRED');
        const amount = this.decimal(input.amount);
        if (amount.lessThanOrEqualTo(0))
            return null;
        const sourceRef = input.sourceRef?.trim() ||
            `JOURNAL:${input.source}:${input.customerId}:${input.orderId ?? 'CUSTOMER'}:${Date.now()}`;
        if (input.source === client_1.DebtSource.PAYMENT || input.source === 'PAYMENT') {
            const assetAccount = this.paymentAssetAccount(input);
            const isAdjustment = assetAccount === exports.JOURNAL_ACCOUNTS.ADJUSTMENTS;
            return this.appendBalanced(db, {
                source: isAdjustment ? 'ADJUSTMENT' : 'PAYMENT',
                sourceRef,
                actorUserId: input.actorUserId,
                customerId: input.customerId,
                orderId: input.orderId ?? null,
                lines: [
                    {
                        accountCode: assetAccount,
                        debit: amount,
                        meta: { note: input.note ?? null },
                    },
                    {
                        accountCode: exports.JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
                        credit: amount,
                        meta: { debtSource: input.source },
                    },
                ],
            });
        }
        if (input.source === client_1.DebtSource.INVOICE_SHORTFALL ||
            input.source === client_1.DebtSource.SUBSCRIPTION_OVERUSE ||
            input.source === 'INVOICE_SHORTFALL' ||
            input.source === 'SUBSCRIPTION_OVERUSE') {
            return this.appendBalanced(db, {
                source: 'INVOICE',
                sourceRef,
                actorUserId: input.actorUserId,
                customerId: input.customerId,
                orderId: input.orderId ?? null,
                lines: [
                    {
                        accountCode: exports.JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
                        debit: amount,
                        meta: { debtSource: input.source },
                    },
                    {
                        accountCode: exports.JOURNAL_ACCOUNTS.REVENUE,
                        credit: amount,
                        meta: { note: input.note ?? null },
                    },
                ],
            });
        }
        return null;
    }
    async getCustomerBalanceFromJournal(customerId) {
        const rows = await this.prisma.journalLine.findMany({
            where: {
                entry: { customerId },
                account: { code: exports.JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
            },
            select: { debit: true, credit: true },
        });
        return rows.reduce((sum, row) => sum.add(row.debit).sub(row.credit), new client_1.Prisma.Decimal(0));
    }
    async logCustomerDrift(customerId, ledgerBalance) {
        const journalBalance = await this.getCustomerBalanceFromJournal(customerId);
        const ledger = this.decimal(ledgerBalance);
        if (ledger.sub(journalBalance).abs().gt(new client_1.Prisma.Decimal('0.001'))) {
            console.error('[JOURNAL_DRIFT]', {
                customerId,
                ledgerBalance: ledger.toFixed(4),
                journalBalance: journalBalance.toFixed(4),
            });
        }
    }
    async getCustomerStatement(customerId) {
        const lines = await this.prisma.journalLine.findMany({
            where: {
                entry: { customerId },
                account: { code: exports.JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
            },
            orderBy: [{ entry: { createdAt: 'asc' } }, { id: 'asc' }],
            select: {
                debit: true,
                credit: true,
                entry: { select: { id: true, source: true, sourceRef: true, createdAt: true } },
            },
        });
        let balance = new client_1.Prisma.Decimal(0);
        const rows = lines.map((line) => {
            balance = balance.add(line.debit).sub(line.credit);
            return {
                entryId: line.entry.id,
                date: line.entry.createdAt.toISOString(),
                description: `${line.entry.source} ${line.entry.sourceRef}`,
                debit: line.debit.toFixed(4),
                credit: line.credit.toFixed(4),
                balance: balance.toFixed(4),
            };
        });
        return { balance: balance.toFixed(4), rows };
    }
    paymentAssetAccount(input) {
        const ref = input.sourceRef ?? '';
        const method = input.paymentMethod ?? '';
        const note = input.note?.toLowerCase() ?? '';
        if (ref.includes(':KNET:') || method === client_1.PosPaymentMethod.KNET) {
            return exports.JOURNAL_ACCOUNTS.BANK_KNET;
        }
        if (ref.includes(':ONLINE:') ||
            ref.includes(':PAYMENT_LINK:') ||
            method === client_1.PosPaymentMethod.ONLINE ||
            method === client_1.PosPaymentMethod.PAYMENT_LINK) {
            return exports.JOURNAL_ACCOUNTS.BANK_ONLINE;
        }
        if (ref.includes(':CASH:') || method === client_1.PosPaymentMethod.CASH) {
            return exports.JOURNAL_ACCOUNTS.CASH;
        }
        if (ref.startsWith('ADJUSTMENT:') || note.includes('void') || note.includes('edit')) {
            return exports.JOURNAL_ACCOUNTS.ADJUSTMENTS;
        }
        return exports.JOURNAL_ACCOUNTS.CASH;
    }
    decimal(value) {
        return value instanceof client_1.Prisma.Decimal
            ? value
            : new client_1.Prisma.Decimal(value.toString());
    }
};
exports.DoubleEntryJournalService = DoubleEntryJournalService;
exports.DoubleEntryJournalService = DoubleEntryJournalService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DoubleEntryJournalService);
//# sourceMappingURL=double-entry-journal.service.js.map