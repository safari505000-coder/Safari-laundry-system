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
exports.InvoiceAuditService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../prisma/prisma.service");
const general_ledger_service_1 = require("../general-ledger/general-ledger.service");
const double_entry_journal_service_1 = require("../general-ledger/double-entry-journal.service");
const customer_notifications_service_1 = require("../customer-notifications/customer-notifications.service");
const invoice_pdf_util_1 = require("../orders/invoice-pdf.util");
const debt_ledger_payment_origin_util_1 = require("../finance/debt-ledger-payment-origin.util");
const kuwait_time_1 = require("../common/time/kuwait-time");
let InvoiceAuditService = class InvoiceAuditService {
    prisma;
    generalLedger;
    journal;
    customerNotifications;
    jwt;
    constructor(prisma, generalLedger, journal, customerNotifications, jwt) {
        this.prisma = prisma;
        this.generalLedger = generalLedger;
        this.journal = journal;
        this.customerNotifications = customerNotifications;
        this.jwt = jwt;
    }
    decimalToFilsBigInt(d) {
        if (!d)
            return 0n;
        const filsStr = d.mul(1000).toFixed(0);
        return BigInt(filsStr);
    }
    buildSnapshot(order, lineItems) {
        const snap = {
            id: order.id,
            status: order.status,
            cashStatus: order.cashStatus,
            posPaymentMethod: order.posPaymentMethod,
            totalPrice: order.totalPrice.toFixed(3),
            notes: order.notes,
            customerId: order.customerId,
            driverId: order.driverId,
            invoiceNumber: order.invoiceNumber,
            serialNumber: order.serialNumber,
            createdAt: order.createdAt.toISOString(),
            completedAt: order.completedAt ? order.completedAt.toISOString() : null,
        };
        if (lineItems) {
            snap.lineItems = lineItems
                .map((li) => ({
                id: li.id,
                label: li.label,
                starchOption: li.starchOption,
                quantity: li.quantity.toFixed(4),
                unitPrice: li.unitPrice.toFixed(4),
                lineTotal: li.quantity.mul(li.unitPrice).toFixed(4),
            }))
                .sort((a, b) => a.id.localeCompare(b.id));
        }
        return snap;
    }
    diffSnapshots(before, after) {
        const keys = new Set([
            ...Object.keys(before),
            ...Object.keys(after),
        ]);
        const changed = [];
        for (const key of keys) {
            if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
                changed.push(key);
            }
        }
        return changed;
    }
    async reverseWalletForOrder(tx, order, actorUserId) {
        if (!order.walletSettledAt)
            return;
        const wallet = await tx.customerWallet.findUnique({
            where: { customerId: order.customerId },
            select: { id: true, balance: true, debt: true },
        });
        if (!wallet)
            return;
        const method = order.posPaymentMethod;
        if (method === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT) {
            const newDebt = wallet.debt.sub(order.totalPrice);
            await tx.customerWallet.update({
                where: { id: wallet.id },
                data: {
                    debt: newDebt.lt(0) ? new client_1.Prisma.Decimal(0) : newDebt,
                },
            });
            if (order.id) {
                const sourceRef = `ADJUSTMENT:INVOICE_AUDIT_VOID:${order.id}:${Date.now()}`;
                (0, debt_ledger_payment_origin_util_1.traceDebtLedgerPaymentWrite)({
                    sourceFile: 'src/invoice-audit/invoice-audit.service.ts',
                    functionName: 'reverseWalletForOrder',
                    payload: {
                        amount: order.totalPrice.toString(),
                        customerId: order.customerId,
                        orderId: order.id,
                        source: 'PAYMENT',
                        actorUserId: actorUserId ?? null,
                        sourceRef,
                        metadata: { origin: 'INVOICE_AUDIT_VOID_NON_MONEY' },
                    },
                });
                await tx.debtLedgerEntry.create({
                    data: {
                        customerId: order.customerId,
                        orderId: order.id,
                        source: 'PAYMENT',
                        category: 'BRANCH',
                        amount: order.totalPrice,
                        actorUserId: actorUserId ?? null,
                        sourceRef,
                        note: 'Debt reversed by invoice void / edit (supervisor)',
                    },
                });
                if (actorUserId) {
                    await this.journal.mirrorDebtLedgerEntry(tx, {
                        source: 'PAYMENT',
                        amount: order.totalPrice,
                        sourceRef,
                        actorUserId,
                        customerId: order.customerId,
                        orderId: order.id,
                        note: 'Debt reversed by invoice void / edit (supervisor)',
                    });
                }
                else {
                    console.error('[JOURNAL_DRIFT]', {
                        customerId: order.customerId,
                        orderId: order.id,
                        reason: 'INVOICE_AUDIT_VOID_MISSING_ACTOR',
                    });
                }
            }
        }
        else if (method === client_1.PosPaymentMethod.SUBSCRIPTION_WALLET) {
            await tx.customerWallet.update({
                where: { id: wallet.id },
                data: { balance: wallet.balance.add(order.totalPrice) },
            });
        }
    }
    async applyWalletForOrder(tx, order, actorUserId) {
        if (!order.walletSettledAt)
            return;
        const method = order.posPaymentMethod;
        if (method !== client_1.PosPaymentMethod.DEBT_ON_ACCOUNT && method !== client_1.PosPaymentMethod.SUBSCRIPTION_WALLET) {
            return;
        }
        const wallet = await tx.customerWallet.upsert({
            where: { customerId: order.customerId },
            create: { customerId: order.customerId },
            update: {},
            select: { id: true, balance: true, debt: true },
        });
        if (method === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT) {
            await tx.customerWallet.update({
                where: { id: wallet.id },
                data: { debt: wallet.debt.add(order.totalPrice) },
            });
            if (order.id) {
                await tx.debtLedgerEntry.create({
                    data: {
                        customerId: order.customerId,
                        orderId: order.id,
                        source: 'INVOICE_SHORTFALL',
                        category: 'BRANCH',
                        amount: order.totalPrice,
                        actorUserId: actorUserId ?? null,
                        note: 'Debt re-applied by invoice edit (new amount/method)',
                    },
                });
            }
        }
        else {
            const newBalance = wallet.balance.sub(order.totalPrice);
            await tx.customerWallet.update({
                where: { id: wallet.id },
                data: {
                    balance: newBalance.lt(0) ? new client_1.Prisma.Decimal(0) : newBalance,
                },
            });
        }
    }
    async editInvoice(orderId, actorId, actorRole, dto) {
        if (actorRole !== client_1.SafariRole.CALL_CENTER_SUPERVISOR &&
            actorRole !== client_1.SafariRole.OWNER) {
            throw new common_1.ForbiddenException('Only a Call Center Supervisor (or Owner) can edit an invoice.');
        }
        const keys = [
            'totalPrice',
            'posPaymentMethod',
            'notes',
            'lineItems',
        ];
        const hasChange = keys.some((k) => dto[k] !== undefined);
        if (!hasChange) {
            throw new common_1.BadRequestException('At least one of totalPrice, posPaymentMethod, notes, lineItems must be supplied.');
        }
        const out = await this.prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { id: orderId },
                select: {
                    id: true,
                    status: true,
                    cashStatus: true,
                    posPaymentMethod: true,
                    totalPrice: true,
                    notes: true,
                    customerId: true,
                    driverId: true,
                    invoiceNumber: true,
                    serialNumber: true,
                    createdAt: true,
                    completedAt: true,
                    walletSettledAt: true,
                },
            });
            if (!order)
                throw new common_1.NotFoundException('Order not found');
            if (order.status === client_1.OrderStatus.CANCELED) {
                throw new common_1.BadRequestException('Canceled invoices cannot be edited — re-issue a new invoice instead.');
            }
            const now = new Date();
            if (!(0, kuwait_time_1.isSameKuwaitDay)(order.createdAt, now)) {
                throw new common_1.BadRequestException('Same-day edit window expired — this invoice was issued on a prior Kuwait-local day.');
            }
            const existingLines = await tx.orderLineItem.findMany({
                where: { orderId: order.id },
                select: {
                    id: true,
                    label: true,
                    starchOption: true,
                    quantity: true,
                    unitPrice: true,
                },
            });
            const before = this.buildSnapshot(order, existingLines);
            let computedTotal = null;
            if (dto.lineItems !== undefined) {
                const payloadIds = new Set(dto.lineItems
                    .map((li) => li.id)
                    .filter((v) => typeof v === 'string'));
                const toDelete = existingLines
                    .filter((l) => !payloadIds.has(l.id))
                    .map((l) => l.id);
                if (toDelete.length > 0) {
                    await tx.orderLineItem.deleteMany({
                        where: { id: { in: toDelete } },
                    });
                }
                let runningTotal = new client_1.Prisma.Decimal(0);
                for (const li of dto.lineItems) {
                    const qty = new client_1.Prisma.Decimal(li.quantity);
                    const unit = new client_1.Prisma.Decimal(li.unitPrice);
                    if (qty.lt(0) || unit.lt(0)) {
                        throw new common_1.BadRequestException('Line-item quantity and unitPrice must be non-negative.');
                    }
                    runningTotal = runningTotal.add(qty.mul(unit));
                    if (li.id) {
                        await tx.orderLineItem.update({
                            where: { id: li.id },
                            data: {
                                label: li.label ?? null,
                                starchOption: li.starchOption ?? client_1.StarchOption.NONE,
                                quantity: qty,
                                unitPrice: unit,
                            },
                        });
                    }
                    else {
                        await tx.orderLineItem.create({
                            data: {
                                orderId: order.id,
                                label: li.label ?? null,
                                starchOption: li.starchOption ?? client_1.StarchOption.NONE,
                                quantity: qty,
                                unitPrice: unit,
                            },
                        });
                    }
                }
                computedTotal = runningTotal;
            }
            const newTotal = computedTotal !== null
                ? computedTotal
                : dto.totalPrice !== undefined
                    ? new client_1.Prisma.Decimal(dto.totalPrice)
                    : order.totalPrice;
            if (newTotal.lt(0)) {
                throw new common_1.BadRequestException('totalPrice cannot be negative.');
            }
            const newMethod = dto.posPaymentMethod ?? order.posPaymentMethod;
            const newNotes = dto.notes !== undefined ? dto.notes : order.notes;
            await this.reverseWalletForOrder(tx, { ...order, id: order.id }, actorId);
            await tx.order.update({
                where: { id: order.id },
                data: {
                    totalPrice: newTotal,
                    posPaymentMethod: newMethod,
                    notes: newNotes,
                },
            });
            await this.applyWalletForOrder(tx, {
                id: order.id,
                customerId: order.customerId,
                totalPrice: newTotal,
                posPaymentMethod: newMethod,
                walletSettledAt: order.walletSettledAt,
            }, actorId);
            const delta = newTotal.sub(order.totalPrice);
            if (!delta.isZero() || newMethod !== order.posPaymentMethod) {
                await this.generalLedger.append(tx, {
                    entryType: client_1.GeneralLedgerEntryType.POS_SALE_COMPLETED,
                    amount: order.totalPrice.neg(),
                    memo: 'Invoice edit — reversal of original amount',
                    orderId: order.id,
                    customerId: order.customerId,
                    actorUserId: actorId,
                    metadata: {
                        source: 'SUPERVISOR_EDIT_REVERSAL',
                        reversalForOrderId: order.id,
                        originalPaymentMethod: order.posPaymentMethod,
                        originalAmount: order.totalPrice.toFixed(3),
                    },
                });
                await this.generalLedger.append(tx, {
                    entryType: client_1.GeneralLedgerEntryType.POS_SALE_COMPLETED,
                    amount: newTotal,
                    memo: 'Invoice edit — new amount posted',
                    orderId: order.id,
                    customerId: order.customerId,
                    actorUserId: actorId,
                    metadata: {
                        source: 'SUPERVISOR_EDIT_NEW',
                        editedOrderId: order.id,
                        newPaymentMethod: newMethod,
                        newAmount: newTotal.toFixed(3),
                    },
                });
            }
            const refreshed = await tx.order.findUniqueOrThrow({
                where: { id: order.id },
                select: {
                    id: true,
                    status: true,
                    cashStatus: true,
                    posPaymentMethod: true,
                    totalPrice: true,
                    notes: true,
                    customerId: true,
                    driverId: true,
                    invoiceNumber: true,
                    serialNumber: true,
                    createdAt: true,
                    completedAt: true,
                },
            });
            const refreshedLines = await tx.orderLineItem.findMany({
                where: { orderId: order.id },
                select: {
                    id: true,
                    label: true,
                    starchOption: true,
                    quantity: true,
                    unitPrice: true,
                },
            });
            const after = this.buildSnapshot(refreshed, refreshedLines);
            const changedFields = this.diffSnapshots(before, after);
            const actor = await tx.user.findUniqueOrThrow({
                where: { id: actorId },
                select: { fullName: true, safariRole: true },
            });
            const audit = await tx.invoiceAuditLog.create({
                data: {
                    orderId: order.id,
                    action: client_1.InvoiceAuditAction.EDIT,
                    actorId,
                    actorRole: actor.safariRole,
                    actorName: actor.fullName,
                    beforeSnapshot: before,
                    afterSnapshot: after,
                    changedFields,
                    reason: dto.reason ?? null,
                    financialImpactFils: this.decimalToFilsBigInt(newTotal) -
                        this.decimalToFilsBigInt(order.totalPrice),
                    kuwaitDay: (0, kuwait_time_1.kuwaitDayIso)(now),
                },
            });
            return {
                orderId: order.id,
                auditId: audit.id,
                changedFields,
                newTotal: newTotal.toFixed(3),
                newPaymentMethod: newMethod,
                issuerUserId: order.driverId,
            };
        }, { maxWait: 10_000, timeout: 15_000 });
        void this.queueIssuerReprintNudgeAfterEdit({
            orderId: out.orderId,
            issuerUserId: out.issuerUserId,
            newTotalKd: out.newTotal,
            editorId: actorId,
        });
        return {
            orderId: out.orderId,
            auditId: out.auditId,
            changedFields: out.changedFields,
            newTotal: out.newTotal,
            newPaymentMethod: out.newPaymentMethod,
        };
    }
    queueIssuerReprintNudgeAfterEdit(ctx) {
        const { orderId, issuerUserId, newTotalKd, editorId } = ctx;
        if (!issuerUserId) {
            return;
        }
        void (async () => {
            const [issuer, editor, order] = await Promise.all([
                this.prisma.user.findUnique({
                    where: { id: issuerUserId },
                    select: { phone: true },
                }),
                this.prisma.user.findUnique({
                    where: { id: editorId },
                    select: { fullName: true },
                }),
                this.prisma.order.findUnique({
                    where: { id: orderId },
                    select: { invoiceNumber: true, id: true },
                }),
            ]);
            const phone = issuer?.phone?.replace(/[\s-]/g, '').trim();
            if (!phone) {
                return;
            }
            const base = process.env.PUBLIC_WEB_APP_URL?.trim().replace(/\/$/, '');
            let invoiceShareUrl;
            let invoicePdfUrl;
            if (base) {
                try {
                    const token = await this.jwt.signAsync({ purpose: 'INVOICE_SHARE', orderId }, { expiresIn: '7d' });
                    invoiceShareUrl = `${base}/public/invoice/${encodeURIComponent(token)}`;
                    invoicePdfUrl = (0, invoice_pdf_util_1.buildPublicInvoicePdfUrl)(token);
                }
                catch {
                }
            }
            const label = order?.invoiceNumber?.trim() || `#${orderId.slice(0, 8)}`;
            const editorLabel = editor?.fullName?.trim() || 'مشرف';
            this.customerNotifications.notifyInvoiceEditedForIssuer({
                toPhone: phone,
                orderId,
                invoiceLabel: label,
                newAmountKd: newTotalKd,
                editorLabel,
                invoiceShareUrl,
                invoicePdfUrl,
            });
        })();
    }
    async voidInvoice(orderId, actorId, actorRole, reason) {
        if (actorRole !== client_1.SafariRole.CALL_CENTER_SUPERVISOR &&
            actorRole !== client_1.SafariRole.OWNER) {
            throw new common_1.ForbiddenException('Only a Call Center Supervisor (or Owner) can void an invoice.');
        }
        return this.prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { id: orderId },
                select: {
                    id: true,
                    status: true,
                    cashStatus: true,
                    posPaymentMethod: true,
                    totalPrice: true,
                    notes: true,
                    customerId: true,
                    driverId: true,
                    invoiceNumber: true,
                    serialNumber: true,
                    createdAt: true,
                    completedAt: true,
                    walletSettledAt: true,
                },
            });
            if (!order)
                throw new common_1.NotFoundException('Order not found');
            if (order.status === client_1.OrderStatus.CANCELED) {
                throw new common_1.BadRequestException('Invoice is already voided.');
            }
            const before = this.buildSnapshot(order);
            await this.reverseWalletForOrder(tx, order, actorId);
            await tx.order.update({
                where: { id: order.id },
                data: {
                    status: client_1.OrderStatus.CANCELED,
                    walletSettledAt: null,
                },
            });
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.POS_SALE_COMPLETED,
                amount: order.totalPrice.neg(),
                memo: `Invoice void — ${reason.slice(0, 100)}`,
                orderId: order.id,
                customerId: order.customerId,
                actorUserId: actorId,
                metadata: {
                    source: 'SUPERVISOR_VOID',
                    voidedOrderId: order.id,
                    originalPaymentMethod: order.posPaymentMethod,
                    originalAmount: order.totalPrice.toFixed(3),
                    reason,
                },
            });
            const refreshed = await tx.order.findUniqueOrThrow({
                where: { id: order.id },
                select: {
                    id: true,
                    status: true,
                    cashStatus: true,
                    posPaymentMethod: true,
                    totalPrice: true,
                    notes: true,
                    customerId: true,
                    driverId: true,
                    invoiceNumber: true,
                    serialNumber: true,
                    createdAt: true,
                    completedAt: true,
                },
            });
            const after = this.buildSnapshot(refreshed);
            const changedFields = this.diffSnapshots(before, after);
            const actor = await tx.user.findUniqueOrThrow({
                where: { id: actorId },
                select: { fullName: true, safariRole: true },
            });
            const audit = await tx.invoiceAuditLog.create({
                data: {
                    orderId: order.id,
                    action: client_1.InvoiceAuditAction.VOID,
                    actorId,
                    actorRole: actor.safariRole,
                    actorName: actor.fullName,
                    beforeSnapshot: before,
                    afterSnapshot: after,
                    changedFields,
                    reason,
                    financialImpactFils: -this.decimalToFilsBigInt(order.totalPrice),
                    kuwaitDay: (0, kuwait_time_1.kuwaitDayIso)(new Date()),
                },
            });
            return {
                orderId: order.id,
                auditId: audit.id,
                reversedAmount: order.totalPrice.toFixed(3),
                reason,
            };
        }, { maxWait: 10_000, timeout: 15_000 });
    }
    async listAuditLog(query) {
        const where = {};
        if (query.from && query.to) {
            where.kuwaitDay = { gte: query.from, lte: query.to };
        }
        else if (query.from) {
            where.kuwaitDay = { gte: query.from };
        }
        else if (query.to) {
            where.kuwaitDay = { lte: query.to };
        }
        if (query.action)
            where.action = query.action;
        if (query.actorId)
            where.actorId = query.actorId;
        const limit = query.limit ?? 100;
        const offset = query.offset ?? 0;
        const [rows, total] = await Promise.all([
            this.prisma.invoiceAuditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
                include: {
                    order: {
                        select: {
                            id: true,
                            serialNumber: true,
                            invoiceNumber: true,
                            totalPrice: true,
                            status: true,
                            customer: {
                                select: {
                                    id: true,
                                    displayName: true,
                                    phone: true,
                                },
                            },
                        },
                    },
                    actor: {
                        select: { id: true, fullName: true, safariRole: true },
                    },
                },
            }),
            this.prisma.invoiceAuditLog.count({ where }),
        ]);
        return {
            rows: rows.map((r) => ({
                id: r.id,
                orderId: r.orderId,
                action: r.action,
                actor: {
                    id: r.actor.id,
                    fullName: r.actor.fullName,
                    safariRole: r.actor.safariRole,
                },
                actorRoleAtTime: r.actorRole,
                actorNameAtTime: r.actorName,
                reason: r.reason,
                changedFields: r.changedFields,
                financialImpactKd: (Number(r.financialImpactFils) / 1000).toFixed(3),
                beforeSnapshot: r.beforeSnapshot,
                afterSnapshot: r.afterSnapshot,
                kuwaitDay: r.kuwaitDay,
                createdAt: r.createdAt.toISOString(),
                order: r.order && {
                    id: r.order.id,
                    serialNumber: r.order.serialNumber,
                    invoiceNumber: r.order.invoiceNumber,
                    totalPriceKd: r.order.totalPrice.toFixed(3),
                    status: r.order.status,
                    customer: r.order.customer,
                },
            })),
            total,
            limit,
            offset,
        };
    }
    async getCcPerformance(q) {
        const now = new Date();
        const todayIso = (0, kuwait_time_1.kuwaitDayIso)(now);
        const fromIso = q.from ?? todayIso;
        const toIso = q.to ?? todayIso;
        const fromUtc = new Date(`${fromIso}T00:00:00+03:00`);
        const toUtc = new Date(`${toIso}T23:59:59.999+03:00`);
        const rows = await this.prisma.transactionHistory.findMany({
            where: {
                createdAt: { gte: fromUtc, lte: toUtc },
                OR: [
                    {
                        type: 'ORDER_WALLET_SETTLEMENT',
                    },
                    {
                        type: 'SUBSCRIPTION_ACTIVATION',
                    },
                ],
            },
            select: {
                id: true,
                type: true,
                amount: true,
                customerId: true,
                performedById: true,
                metadata: true,
                createdAt: true,
                performedBy: {
                    select: {
                        id: true,
                        fullName: true,
                        safariRole: true,
                    },
                },
            },
        });
        const agg = new Map();
        const bumpAgent = (row) => {
            const performer = row.performedBy;
            if (!performer)
                return null;
            if (performer.safariRole !== client_1.SafariRole.CALL_CENTER &&
                performer.safariRole !== client_1.SafariRole.CALL_CENTER_SUPERVISOR)
                return null;
            let a = agg.get(performer.id);
            if (!a) {
                a = {
                    agentId: performer.id,
                    agentName: performer.fullName,
                    role: performer.safariRole,
                    collectedKd: new client_1.Prisma.Decimal(0),
                    debtSettledKd: new client_1.Prisma.Decimal(0),
                    activationsCount: 0,
                    customerIds: new Set(),
                };
                agg.set(performer.id, a);
            }
            return a;
        };
        for (const row of rows) {
            const a = bumpAgent(row);
            if (!a)
                continue;
            const meta = (row.metadata ?? {});
            a.customerIds.add(row.customerId);
            if (row.type === 'SUBSCRIPTION_ACTIVATION') {
                a.activationsCount += 1;
                const dsStr = typeof meta.debtSettled === 'string' ? meta.debtSettled : null;
                if (dsStr)
                    a.debtSettledKd = a.debtSettledKd.add(new client_1.Prisma.Decimal(dsStr));
            }
            else if (row.type === 'ORDER_WALLET_SETTLEMENT') {
                const viaCallCenter = meta.debtSettlementViaCallCenter === true ||
                    meta.source === 'CALL_CENTER_MANUAL';
                if (viaCallCenter) {
                    a.collectedKd = a.collectedKd.add(row.amount);
                    const dsStr = typeof meta.debtSettled === 'string' ? meta.debtSettled : null;
                    if (dsStr)
                        a.debtSettledKd = a.debtSettledKd.add(new client_1.Prisma.Decimal(dsStr));
                }
            }
        }
        const agents = Array.from(agg.values())
            .map((a) => ({
            agentId: a.agentId,
            agentName: a.agentName,
            role: a.role,
            collectedKd: a.collectedKd.toFixed(3),
            debtSettledKd: a.debtSettledKd.toFixed(3),
            activationsCount: a.activationsCount,
            customersServed: a.customerIds.size,
        }))
            .sort((a, b) => Number(b.collectedKd) - Number(a.collectedKd));
        const totals = agents.reduce((acc, a) => ({
            collectedKd: acc.collectedKd.add(new client_1.Prisma.Decimal(a.collectedKd)),
            debtSettledKd: acc.debtSettledKd.add(new client_1.Prisma.Decimal(a.debtSettledKd)),
            activationsCount: acc.activationsCount + a.activationsCount,
            customersServed: acc.customersServed + a.customersServed,
        }), {
            collectedKd: new client_1.Prisma.Decimal(0),
            debtSettledKd: new client_1.Prisma.Decimal(0),
            activationsCount: 0,
            customersServed: 0,
        });
        return {
            from: fromIso,
            to: toIso,
            agents,
            totals: {
                collectedKd: totals.collectedKd.toFixed(3),
                debtSettledKd: totals.debtSettledKd.toFixed(3),
                activationsCount: totals.activationsCount,
                customersServed: totals.customersServed,
            },
        };
    }
};
exports.InvoiceAuditService = InvoiceAuditService;
exports.InvoiceAuditService = InvoiceAuditService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        general_ledger_service_1.GeneralLedgerService,
        double_entry_journal_service_1.DoubleEntryJournalService,
        customer_notifications_service_1.CustomerNotificationsService,
        jwt_1.JwtService])
], InvoiceAuditService);
//# sourceMappingURL=invoice-audit.service.js.map