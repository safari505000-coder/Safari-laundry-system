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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var OrdersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = exports.STALE_QUICK_ORDER_THRESHOLD_MS = exports.STALE_QUICK_ORDER_THRESHOLD_HOURS = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const dispatch_events_1 = require("../dispatch/dispatch.events");
const audit_logs_service_1 = require("../audit-logs/audit-logs.service");
const customer_blocking_service_1 = require("../common/services/customer-blocking.service");
const outstanding_service_1 = require("../finance/outstanding/outstanding.service");
const payments_service_1 = require("../common/services/payments.service");
const customer_notifications_service_1 = require("../customer-notifications/customer-notifications.service");
const customer_ledger_service_1 = require("../customer-ledger/customer-ledger.service");
const cash_status_for_method_1 = require("../common/utils/cash-status-for-method");
const kuwait_customer_phone_1 = require("../common/validation/kuwait-customer-phone");
const general_ledger_service_1 = require("../general-ledger/general-ledger.service");
const finance_money_1 = require("../finance/finance-money");
const inventory_service_1 = require("../inventory/inventory.service");
const administrative_branch_util_1 = require("../branches/administrative-branch.util");
const debt_customer_aggregates_util_1 = require("../finance/debt-customer-aggregates.util");
const debt_ledger_payment_origin_util_1 = require("../finance/debt-ledger-payment-origin.util");
const debt_kd_breakdown_util_1 = require("./debt-kd-breakdown.util");
const prisma_service_1 = require("../prisma/prisma.service");
const serial_counter_service_1 = require("../serials/serial-counter.service");
const order_status_machine_1 = require("./order-status.machine");
const order_total_util_1 = require("./order-total.util");
const invoice_pdf_util_1 = require("./invoice-pdf.util");
const pdfkit_1 = __importDefault(require("pdfkit"));
const node_stream_1 = require("node:stream");
const PAYMENT_LINK_VALIDITY_HOURS = 24;
const PAYMENT_LINK_VALIDITY_MS = PAYMENT_LINK_VALIDITY_HOURS * 60 * 60 * 1000;
exports.STALE_QUICK_ORDER_THRESHOLD_HOURS = 24;
exports.STALE_QUICK_ORDER_THRESHOLD_MS = exports.STALE_QUICK_ORDER_THRESHOLD_HOURS * 60 * 60 * 1000;
const orderDetailSelect = {
    id: true,
    status: true,
    serviceType: true,
    totalPrice: true,
    cashStatus: true,
    posPaymentMethod: true,
    completedAt: true,
    walletSettledAt: true,
    invoiceNumber: true,
    serialNumber: true,
    notes: true,
    reminderCount: true,
    lastReminderAt: true,
    dispatchId: true,
    createdAt: true,
    updatedAt: true,
    customer: {
        select: {
            id: true,
            phone: true,
            phone2: true,
            address: true,
            displayName: true,
            wallet: { select: { balance: true, debt: true } },
        },
    },
    driver: {
        select: {
            id: true,
            username: true,
            fullName: true,
            employeeId: true,
            jobTitle: true,
            phone: true,
            safariRole: true,
            branch: { select: { id: true, name: true } },
        },
    },
    lineItems: {
        select: {
            id: true,
            label: true,
            starchOption: true,
            quantity: true,
            unitPrice: true,
        },
    },
};
const terminalStatuses = [
    client_1.OrderStatus.COMPLETED,
    client_1.OrderStatus.CANCELED,
];
let OrdersService = OrdersService_1 = class OrdersService {
    prisma;
    customerLedger;
    paymentsService;
    customerNotifications;
    generalLedger;
    serialCounter;
    inventory;
    jwt;
    customerBlocking;
    outstanding;
    auditLogs;
    events;
    log = new common_1.Logger(OrdersService_1.name);
    constructor(prisma, customerLedger, paymentsService, customerNotifications, generalLedger, serialCounter, inventory, jwt, customerBlocking, outstanding, auditLogs, events) {
        this.prisma = prisma;
        this.customerLedger = customerLedger;
        this.paymentsService = paymentsService;
        this.customerNotifications = customerNotifications;
        this.generalLedger = generalLedger;
        this.serialCounter = serialCounter;
        this.inventory = inventory;
        this.jwt = jwt;
        this.customerBlocking = customerBlocking;
        this.outstanding = outstanding;
        this.auditLogs = auditLogs;
        this.events = events;
    }
    emitOrderCreated(order, actorUserId) {
        this.events.emit(dispatch_events_1.ORDER_CREATED_EVENT, {
            orderId: order.id,
            dispatchId: order.dispatchId ?? null,
            actorUserId,
            occurredAtIso: order.createdAt.toISOString(),
        });
    }
    auditOrderCreated(order, actorUserId) {
        this.auditLogs.logFinancialEvent({
            action: 'ORDER_CREATED',
            customerId: order.customer.id,
            orderId: order.id,
            amount: order.totalPrice.toString(),
            source: order.posPaymentMethod ?? 'UNKNOWN',
            userId: actorUserId,
            changes: {
                status: order.status,
                cashStatus: order.cashStatus,
                posPaymentMethod: order.posPaymentMethod,
            },
        });
    }
    auditOrderPayment(order, actorUserId) {
        this.auditLogs.logFinancialEvent({
            action: 'PAYMENT_MADE',
            customerId: order.customer.id,
            orderId: order.id,
            amount: order.totalPrice.toString(),
            source: order.posPaymentMethod ?? 'UNKNOWN',
            userId: actorUserId,
            changes: {
                cashStatus: order.cashStatus,
                posPaymentMethod: order.posPaymentMethod,
            },
        });
    }
    async resolveInvoiceShareForNotify(orderId) {
        const webBase = process.env.PUBLIC_WEB_APP_URL?.trim().replace(/\/$/, '');
        const apiBase = (process.env.PUBLIC_API_URL?.trim() ||
            process.env.PAYMENTS_CALLBACK_PUBLIC_URL?.trim() ||
            '').replace(/\/$/, '');
        if (!webBase && !apiBase) {
            return undefined;
        }
        const row = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true },
        });
        if (!row) {
            return undefined;
        }
        const mintBase = webBase || apiBase;
        const minted = await this.mintInvoiceShareLink(orderId, mintBase);
        return {
            shareUrl: webBase ? minted.shareUrl : undefined,
            pdfUrl: minted.pdfUrl,
        };
    }
    formatLineItemsBlockForNotify(detail) {
        if (!detail.lineItems?.length) {
            return '';
        }
        const out = [];
        for (const li of detail.lineItems) {
            const qty = Number(li.quantity);
            const unit = Number(li.unitPrice);
            const sub = (qty * unit).toFixed(3);
            const label = (li.label ?? '—').replace(/\s+/g, ' ').trim();
            out.push(`• ${label} — العدد ${String(qty)} × ${unit.toFixed(3)} = ${sub} د.ك`);
        }
        return out.join('\n');
    }
    formatLineItemsBlockForBundleNotify(orders) {
        if (orders.length === 0) {
            return '';
        }
        if (orders.length === 1) {
            return this.formatLineItemsBlockForNotify(orders[0]);
        }
        const parts = [];
        for (const o of orders) {
            const lab = this.invoiceLabelForCustomerNotify(o);
            const block = this.formatLineItemsBlockForNotify(o);
            parts.push(`━━ ${lab} ━━`, block || '—');
        }
        return parts.join('\n\n');
    }
    invoiceLabelForCustomerNotify(order) {
        return (order.serialNumber?.trim() ||
            order.invoiceNumber?.trim() ||
            `#${order.id.slice(0, 8)}`);
    }
    async posInvoiceNotifyToCustomer(detail, phoneCompact) {
        const phone = (0, kuwait_customer_phone_1.resolveCustomerPhoneForNotify)(detail.customer.phone, detail.customer.phone2, phoneCompact);
        const inv = this.invoiceLabelForCustomerNotify(detail);
        const amt = detail.totalPrice.toFixed(3);
        const lineItemsSummary = this.formatLineItemsBlockForNotify(detail);
        await this.customerNotifications.deliverInvoiceIssuedNow({
            customerPhone: phone,
            orderId: detail.id,
            invoiceLabel: inv,
            amountKd: amt,
            paymentUrl: detail.paymentLink?.url,
            lineItemsSummary: lineItemsSummary || undefined,
        });
    }
    isManagerOrOwner(role) {
        return (role === client_1.SafariRole.OWNER ||
            role === client_1.SafariRole.GENERAL_MANAGER ||
            role === client_1.SafariRole.MANAGER);
    }
    canViewAllOrders(role) {
        return (this.isManagerOrOwner(role) ||
            role === client_1.SafariRole.CALL_CENTER ||
            role === client_1.SafariRole.CALL_CENTER_SUPERVISOR ||
            role === client_1.SafariRole.ACCOUNTANT ||
            role === client_1.SafariRole.SUPERVISOR ||
            role === client_1.SafariRole.VIEWER);
    }
    canStaffUpdateOrders(role) {
        return (role === client_1.SafariRole.MANAGER ||
            role === client_1.SafariRole.SUPERVISOR);
    }
    async assertDriverUser(id) {
        const u = await this.prisma.user.findUnique({ where: { id } });
        if (!u || u.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.ForbiddenException('The assigned user must have the DRIVER role');
        }
    }
    async assertPosCheckoutActor(id) {
        const u = await this.prisma.user.findUnique({ where: { id } });
        if (!u ||
            (u.safariRole !== client_1.SafariRole.DRIVER &&
                u.safariRole !== client_1.SafariRole.MANAGER)) {
            throw new common_1.ForbiddenException('POS checkout is only available to drivers and managers.');
        }
    }
    async assertCallCenterDispatchRequirement(actorUserId, dispatchId) {
        const u = await this.prisma.user.findUnique({
            where: { id: actorUserId },
            select: { safariRole: true },
        });
        if (u?.safariRole === client_1.SafariRole.CALL_CENTER && !dispatchId) {
            throw new common_1.BadRequestException({
                code: 'CALL_CENTER_DISPATCH_REQUIRED',
                message: 'CALL_CENTER actors must supply dispatchId on order creation.',
            });
        }
    }
    resolvePosCheckoutPaymentMethod(shortfallMinor, raw) {
        if (shortfallMinor === 0n) {
            return client_1.PosPaymentMethod.SUBSCRIPTION_WALLET;
        }
        const s = String(raw ?? 'CASH')
            .trim()
            .toUpperCase()
            .replace(/-/g, '_')
            .replace(/\s+/g, '');
        if (s === 'KNET') {
            return client_1.PosPaymentMethod.KNET;
        }
        if (s === 'ONLINE' ||
            s === 'PAYMENT_LINK' ||
            s === 'LINK' ||
            s === 'PAYMENTLINK') {
            return client_1.PosPaymentMethod.ONLINE;
        }
        if (s === 'DEBT_ON_ACCOUNT' ||
            s === 'ON_ACCOUNT' ||
            s === 'DEBT' ||
            s === 'CREDIT') {
            return client_1.PosPaymentMethod.DEBT_ON_ACCOUNT;
        }
        return client_1.PosPaymentMethod.CASH;
    }
    reconcileLineItems(totalPrice, lineItems) {
        const items = lineItems ?? [];
        (0, order_total_util_1.assertLineItemsMatchTotal)(totalPrice, items);
        if (!items.length) {
            return undefined;
        }
        return items.map((line) => ({
            label: line.label?.trim() || null,
            starchOption: line.starchOption ?? 'NONE',
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            stockItemId: line.stockItemId ?? null,
        }));
    }
    mapPosCheckoutLineItems(lineItems) {
        const items = lineItems ?? [];
        if (!items.length) {
            return undefined;
        }
        return items.map((line) => ({
            label: line.label?.trim() || null,
            starchOption: line.starchOption ?? 'NONE',
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            stockItemId: line.stockItemId ?? null,
        }));
    }
    async findCustomerByAnyPhone(tx, phoneCompact) {
        return tx.customer.findFirst({
            where: {
                OR: [{ phone: phoneCompact }, { phone2: phoneCompact }],
            },
        });
    }
    async resolveQuickOrderCustomerId(tx, dto, phoneCompact) {
        if (dto.customerId) {
            const existing = await tx.customer.findUnique({
                where: { id: dto.customerId },
            });
            if (!existing) {
                throw new common_1.NotFoundException('Customer not found');
            }
            const existingCompact = existing.phone.replace(/[\s-]/g, '').trim();
            const existingCompact2 = existing.phone2?.replace(/[\s-]/g, '').trim();
            if (existingCompact !== phoneCompact && existingCompact2 !== phoneCompact) {
                throw new common_1.BadRequestException('customerPhone does not match the selected customer');
            }
            const name = dto.customerDisplayName?.trim();
            if (name) {
                await tx.customer.update({
                    where: { id: existing.id },
                    data: { displayName: name },
                });
            }
            return existing.id;
        }
        const existingByPhone = await this.findCustomerByAnyPhone(tx, phoneCompact);
        const customer = existingByPhone ?
            await tx.customer.update({
                where: { id: existingByPhone.id },
                data: {
                    displayName: dto.customerDisplayName?.trim() || existingByPhone.displayName,
                    address: dto.customerAddress?.trim() || existingByPhone.address,
                },
            })
            : await tx.customer.create({
                data: {
                    phone: phoneCompact,
                    address: dto.customerAddress?.trim() || null,
                    displayName: dto.customerDisplayName?.trim() || null,
                },
            });
        return customer.id;
    }
    async createQuick(driverUserId, dto) {
        await this.assertDriverUser(driverUserId);
        await this.assertCallCenterDispatchRequirement(driverUserId, null);
        await (0, administrative_branch_util_1.assertUserNotOnAdministrativeBranchForSales)(this.prisma, driverUserId);
        const serviceType = dto.serviceType ?? client_1.ServiceType.NORMAL;
        const lineCreates = this.reconcileLineItems(dto.totalPrice, dto.lineItems);
        const phoneCompact = dto.customerPhone.replace(/[\s-]/g, '').trim();
        const order = await this.prisma.$transaction(async (tx) => {
            const customerId = await this.resolveQuickOrderCustomerId(tx, dto, phoneCompact);
            await this.outstanding.assertNotBlocked(customerId);
            const serialNumber = await this.serialCounter.stampOrderSerial(tx, driverUserId);
            const posPaymentMethodNormalized = dto.posPaymentMethod === client_1.PosPaymentMethod.PAYMENT_LINK
                ? client_1.PosPaymentMethod.ONLINE
                : dto.posPaymentMethod;
            return tx.order.create({
                data: {
                    customerId,
                    driverId: driverUserId,
                    serviceType,
                    totalPrice: dto.totalPrice,
                    status: client_1.OrderStatus.PENDING,
                    invoiceNumber: dto.invoiceNumber?.trim() || null,
                    serialNumber,
                    notes: dto.notes?.trim() || null,
                    posPaymentMethod: posPaymentMethodNormalized,
                    ...(lineCreates?.length
                        ? { lineItems: { create: lineCreates } }
                        : {}),
                },
                select: orderDetailSelect,
            });
        });
        this.auditOrderCreated(order, driverUserId);
        await this.customerBlocking.autoBlockIfNeeded(order.customer.id);
        return order;
    }
    async posCheckout(driverUserId, dto) {
        try {
            if (driverUserId == null || String(driverUserId).trim() === '') {
                throw new common_1.BadRequestException('posCheckout: missing driver/manager id from session');
            }
            await this.assertPosCheckoutActor(driverUserId);
            await this.assertCallCenterDispatchRequirement(driverUserId, dto.dispatchId);
            await (0, administrative_branch_util_1.assertUserNotOnAdministrativeBranchForSales)(this.prisma, driverUserId);
            if (!Number.isFinite(dto.totalPrice) || dto.totalPrice <= 0) {
                throw new common_1.BadRequestException('totalPrice must be a finite positive number');
            }
            const serviceType = dto.serviceType ?? client_1.ServiceType.NORMAL;
            const lineCreates = this.mapPosCheckoutLineItems(dto.lineItems);
            if (lineCreates) {
                for (const line of lineCreates) {
                    if (!(line.quantity > 0 && line.unitPrice >= 0)) {
                        throw new common_1.BadRequestException('Each line item must have a positive quantity and a non-negative unit price');
                    }
                }
            }
            const phoneCompact = dto.customerPhone.replace(/[\s-]/g, '').trim();
            const totalPriceNum = Number(dto.totalPrice);
            const totalPriceDecimal = new client_1.Prisma.Decimal(totalPriceNum.toFixed(4));
            const orderId = await this.prisma.$transaction(async (tx) => {
                const customerId = await this.resolveQuickOrderCustomerId(tx, dto, phoneCompact);
                await this.outstanding.assertNotBlocked(customerId);
                const walletRow = await tx.customerWallet.findUnique({
                    where: { customerId },
                });
                const balanceMinor = walletRow
                    ? (0, finance_money_1.toMinorFromFixed4)(walletRow.balance)
                    : 0n;
                const totalMinor = (0, finance_money_1.parseFixed4ToMinor)(totalPriceDecimal.toFixed(4));
                const shortfallMinor = totalMinor > balanceMinor ? totalMinor - balanceMinor : 0n;
                const posPaymentMethodResolved = this.resolvePosCheckoutPaymentMethod(shortfallMinor, dto.posPaymentMethod);
                const useHostedPaymentLink = shortfallMinor > 0n &&
                    posPaymentMethodResolved === client_1.PosPaymentMethod.ONLINE;
                if (useHostedPaymentLink) {
                    const serialNumber = await this.serialCounter.stampOrderSerial(tx, driverUserId);
                    const created = await tx.order.create({
                        data: {
                            customerId,
                            driverId: driverUserId,
                            serviceType,
                            totalPrice: totalPriceDecimal,
                            status: client_1.OrderStatus.PENDING,
                            cashStatus: client_1.CashStatus.UNPAID,
                            posPaymentMethod: client_1.PosPaymentMethod.ONLINE,
                            completedAt: null,
                            invoiceNumber: dto.invoiceNumber?.trim() || null,
                            serialNumber,
                            notes: dto.notes?.trim() || null,
                            dispatchId: dto.dispatchId ?? null,
                            ...(lineCreates?.length
                                ? { lineItems: { create: lineCreates } }
                                : {}),
                        },
                        select: { id: true, driverId: true },
                    });
                    if (created == null) {
                        throw new common_1.InternalServerErrorException('posCheckout: order.create (ONLINE) returned no row — check DB and line items');
                    }
                    if (created.driverId !== driverUserId) {
                        throw new common_1.ForbiddenException('Order must be assigned to you');
                    }
                    return created.id;
                }
                const completedAt = new Date();
                const serialNumber = await this.serialCounter.stampOrderSerial(tx, driverUserId);
                const created = await tx.order.create({
                    data: {
                        customerId,
                        driverId: driverUserId,
                        serviceType,
                        totalPrice: totalPriceDecimal,
                        status: client_1.OrderStatus.COMPLETED,
                        cashStatus: (0, cash_status_for_method_1.cashStatusForPaymentMethod)(posPaymentMethodResolved),
                        posPaymentMethod: posPaymentMethodResolved,
                        completedAt,
                        invoiceNumber: dto.invoiceNumber?.trim() || null,
                        serialNumber,
                        notes: dto.notes?.trim() || null,
                        dispatchId: dto.dispatchId ?? null,
                        ...(lineCreates?.length
                            ? { lineItems: { create: lineCreates } }
                            : {}),
                    },
                    select: { id: true, driverId: true },
                });
                if (created == null) {
                    throw new common_1.InternalServerErrorException('posCheckout: order.create (completed) returned no row — check DB and line items');
                }
                if (created.driverId !== driverUserId) {
                    throw new common_1.ForbiddenException('Order must be assigned to you');
                }
                await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(tx, created.id, driverUserId, {
                    customerId,
                    totalPrice: totalPriceDecimal,
                    posPaymentMethod: posPaymentMethodResolved,
                    walletSettledAt: null,
                    skipPerformerLookup: true,
                });
                await this.generalLedger.append(tx, {
                    entryType: client_1.GeneralLedgerEntryType.POS_SALE_COMPLETED,
                    amount: totalPriceDecimal,
                    memo: 'POS checkout',
                    orderId: created.id,
                    customerId,
                    actorUserId: driverUserId,
                    metadata: {
                        posPaymentMethod: posPaymentMethodResolved,
                    },
                });
                const driverRow = await tx.user.findUnique({
                    where: { id: driverUserId },
                    select: { branchId: true },
                });
                await this.inventory.applyOrderStockDecrement(tx, {
                    orderId: created.id,
                    actorUserId: driverUserId,
                    branchId: driverRow?.branchId ?? null,
                    reference: `POS-${created.id.slice(0, 8)}`,
                });
                return created.id;
            }, { maxWait: 10_000, timeout: 15_000 });
            const detail = await this.prisma.order.findUniqueOrThrow({
                where: { id: orderId },
                select: orderDetailSelect,
            });
            if (detail.posPaymentMethod === client_1.PosPaymentMethod.ONLINE &&
                detail.status === client_1.OrderStatus.PENDING) {
                const phone = (0, kuwait_customer_phone_1.resolveCustomerPhoneForNotify)(detail.customer.phone, detail.customer.phone2, phoneCompact);
                const paymentLink = await this.paymentsService.createPaymentLink({
                    orderId: detail.id,
                    amount: detail.totalPrice,
                    customerPhone: phone,
                });
                await this.prisma.order.update({
                    where: { id: detail.id },
                    data: {
                        posHostedPaymentUrl: paymentLink.url,
                        posGatewayTrackId: paymentLink.trackId ?? null,
                        posGatewayMetadata: {
                            charge: {
                                provider: 'upayments',
                                trackId: paymentLink.trackId ?? null,
                                link: paymentLink.url,
                                createdAt: new Date().toISOString(),
                                source: 'posCheckout',
                            },
                        },
                    },
                });
                const merged = { ...detail, paymentLink };
                this.auditOrderCreated(merged, driverUserId);
                this.emitOrderCreated(merged, driverUserId);
                await this.posInvoiceNotifyToCustomer(merged, phoneCompact);
                await this.prisma.order.update({
                    where: { id: detail.id },
                    data: { ccCollectionPaymentWaLocked: true },
                });
                await this.customerBlocking.autoBlockIfNeeded(merged.customer.id);
                return merged;
            }
            void this.posInvoiceNotifyToCustomer(detail, phoneCompact).catch((e) => this.log.warn(`pos invoice notify: ${e}`));
            this.paymentsService.schedulePaymentConfirmedCustomerNotify(detail.id, 'new_pos_order');
            this.auditOrderCreated(detail, driverUserId);
            this.emitOrderCreated(detail, driverUserId);
            this.auditOrderPayment(detail, driverUserId);
            await this.customerBlocking.autoBlockIfNeeded(detail.customer.id);
            return detail;
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
                console.error('POS_CHECKOUT_ERROR Prisma', error.code, error.meta, error.message);
            }
            else {
                console.error('POS_CHECKOUT_ERROR:', error);
            }
            throw error;
        }
    }
    async posCheckoutBundle(driverUserId, dto) {
        if (driverUserId == null || String(driverUserId).trim() === '') {
            throw new common_1.BadRequestException('posCheckoutBundle: missing driver/manager id from session');
        }
        await this.assertPosCheckoutActor(driverUserId);
        await (0, administrative_branch_util_1.assertUserNotOnAdministrativeBranchForSales)(this.prisma, driverUserId);
        const serviceType = dto.serviceType ?? client_1.ServiceType.NORMAL;
        const phoneCompact = dto.customerPhone.replace(/[\s-]/g, '').trim();
        const prepared = [];
        let sumDecimal = new client_1.Prisma.Decimal(0);
        for (const part of dto.orders) {
            if (!Number.isFinite(part.totalPrice) || part.totalPrice <= 0) {
                throw new common_1.BadRequestException('Each sub-order must have a positive totalPrice');
            }
            if (part.lineItems?.length) {
                (0, order_total_util_1.assertLineItemsMatchTotal)(part.totalPrice, part.lineItems);
            }
            const lineCreates = this.mapPosCheckoutLineItems(part.lineItems);
            if (lineCreates) {
                for (const line of lineCreates) {
                    if (!(line.quantity > 0 && line.unitPrice >= 0)) {
                        throw new common_1.BadRequestException('Each line item must have a positive quantity and a non-negative unit price');
                    }
                }
            }
            const td = new client_1.Prisma.Decimal(Number(part.totalPrice).toFixed(4));
            sumDecimal = sumDecimal.add(td);
            prepared.push({ totalPriceDecimal: td, lineCreates });
        }
        const customerDto = {
            customerPhone: dto.customerPhone,
            customerId: dto.customerId,
            customerDisplayName: dto.customerDisplayName,
            customerAddress: dto.customerAddress,
            totalPrice: dto.orders[0].totalPrice,
            lineItems: dto.orders[0].lineItems,
            serviceType: dto.serviceType,
        };
        const bundleId = await this.prisma.$transaction(async (tx) => {
            const customerId = await this.resolveQuickOrderCustomerId(tx, customerDto, phoneCompact);
            await this.outstanding.assertNotBlocked(customerId);
            const bundle = await tx.posPaymentBundle.create({
                data: {
                    driverId: driverUserId,
                    totalAmountKd: sumDecimal,
                },
            });
            for (const p of prepared) {
                const serialNumber = await this.serialCounter.stampOrderSerial(tx, driverUserId);
                const created = await tx.order.create({
                    data: {
                        customerId,
                        driverId: driverUserId,
                        serviceType,
                        totalPrice: p.totalPriceDecimal,
                        status: client_1.OrderStatus.PENDING,
                        cashStatus: client_1.CashStatus.UNPAID,
                        posPaymentMethod: client_1.PosPaymentMethod.ONLINE,
                        completedAt: null,
                        posPaymentBundleId: bundle.id,
                        serialNumber,
                        ...(p.lineCreates?.length ?
                            { lineItems: { create: p.lineCreates } }
                            : {}),
                    },
                    select: { id: true, driverId: true },
                });
                if (created == null) {
                    throw new common_1.InternalServerErrorException('posCheckoutBundle: order.create returned no row — check DB and line items');
                }
                if (created.driverId !== driverUserId) {
                    throw new common_1.ForbiddenException('Order must be assigned to you');
                }
            }
            return bundle.id;
        }, { maxWait: 10_000, timeout: 15_000 });
        const orders = await this.prisma.order.findMany({
            where: { posPaymentBundleId: bundleId },
            select: orderDetailSelect,
            orderBy: { createdAt: 'asc' },
        });
        if (orders.length === 0) {
            throw new common_1.BadRequestException('Bundle orders missing after checkout');
        }
        const phone = (0, kuwait_customer_phone_1.resolveCustomerPhoneForNotify)(orders[0].customer.phone, orders[0].customer.phone2, phoneCompact);
        const paymentLink = await this.paymentsService.createPaymentLink({
            orderId: bundleId,
            amount: sumDecimal,
            customerPhone: phone,
        });
        await this.prisma.order.updateMany({
            where: { posPaymentBundleId: bundleId },
            data: {
                posHostedPaymentUrl: paymentLink.url,
                posGatewayTrackId: paymentLink.trackId ?? null,
                posGatewayMetadata: {
                    charge: {
                        provider: 'upayments',
                        trackId: paymentLink.trackId ?? null,
                        link: paymentLink.url,
                        createdAt: new Date().toISOString(),
                        source: 'posCheckoutBundle',
                    },
                },
            },
        });
        {
            const first = orders[0];
            const lineItemsSummary = this.formatLineItemsBlockForBundleNotify(orders);
            await this.customerNotifications.deliverInvoiceIssuedNow({
                customerPhone: phone,
                orderId: first.id,
                invoiceLabel: orders.length > 1 ?
                    `مجموعة ${orders.length} فواتير`
                    : this.invoiceLabelForCustomerNotify(first),
                amountKd: sumDecimal.toFixed(3),
                paymentUrl: paymentLink.url,
                lineItemsSummary: lineItemsSummary || undefined,
            });
        }
        await this.prisma.order.updateMany({
            where: { posPaymentBundleId: bundleId },
            data: { ccCollectionPaymentWaLocked: true },
        });
        orders.forEach((order) => this.auditOrderCreated(order, driverUserId));
        await this.customerBlocking.autoBlockIfNeeded(orders[0].customer.id);
        return { bundleId, orders, paymentLink };
    }
    async createAsManager(dto, managerUserId) {
        await this.assertCallCenterDispatchRequirement(managerUserId, null);
        await (0, administrative_branch_util_1.assertUserNotOnAdministrativeBranchForSales)(this.prisma, managerUserId);
        if (dto.driverId) {
            await this.assertDriverUser(dto.driverId);
            await (0, administrative_branch_util_1.assertUserNotOnAdministrativeBranchForSales)(this.prisma, dto.driverId);
        }
        const serviceType = dto.serviceType ?? client_1.ServiceType.NORMAL;
        const lineCreates = this.reconcileLineItems(dto.totalPrice, dto.lineItems);
        const order = await this.prisma.$transaction(async (tx) => {
            const phoneCompact = dto.customerPhone.replace(/[\s-]/g, '').trim();
            const existingByPhone = await this.findCustomerByAnyPhone(tx, phoneCompact);
            const customer = existingByPhone ?
                await tx.customer.update({
                    where: { id: existingByPhone.id },
                    data: {
                        address: dto.customerAddress?.trim() || existingByPhone.address,
                    },
                })
                : await tx.customer.create({
                    data: {
                        phone: phoneCompact,
                        address: dto.customerAddress?.trim() || null,
                    },
                });
            await this.outstanding.assertNotBlocked(customer.id);
            const serialNumber = await this.serialCounter.stampOrderSerial(tx, dto.driverId ?? null);
            return tx.order.create({
                data: {
                    customerId: customer.id,
                    driverId: dto.driverId ?? null,
                    serviceType,
                    totalPrice: dto.totalPrice,
                    status: client_1.OrderStatus.PENDING,
                    posPaymentMethod: client_1.PosPaymentMethod.CASH,
                    invoiceNumber: dto.invoiceNumber?.trim() || null,
                    serialNumber,
                    notes: dto.notes?.trim() || null,
                    ...(lineCreates?.length
                        ? { lineItems: { create: lineCreates } }
                        : {}),
                },
                select: orderDetailSelect,
            });
        });
        this.auditOrderCreated(order, dto.driverId ?? null);
        await this.customerBlocking.autoBlockIfNeeded(order.customer.id);
        return order;
    }
    async listUnpaidCollectionOrders(branchId = null, actor) {
        const isDriver = actor?.role === client_1.SafariRole.DRIVER;
        const effectiveBranchId = isDriver ? null
            : branchId ??
                (actor?.role === client_1.SafariRole.MANAGER && actor.branchId ?
                    actor.branchId
                    : null);
        const branchWhere = isDriver
            ? { driverId: actor.userId }
            : effectiveBranchId
                ? {
                    OR: [
                        { driver: { is: { branchId: effectiveBranchId } } },
                        {
                            driverId: null,
                            customer: { is: { originBranchId: effectiveBranchId } },
                        },
                    ],
                }
                : undefined;
        const rows = await this.prisma.order.findMany({
            where: {
                status: { not: client_1.OrderStatus.CANCELED },
                OR: [
                    { cashStatus: client_1.CashStatus.UNPAID },
                    { posPaymentMethod: client_1.PosPaymentMethod.DEBT_ON_ACCOUNT },
                ],
                ...(branchWhere ?? {}),
            },
            select: {
                id: true,
                customerId: true,
                serialNumber: true,
                invoiceNumber: true,
                totalPrice: true,
                posPaymentMethod: true,
                posHostedPaymentUrl: true,
                cashStatus: true,
                createdAt: true,
                reminderCount: true,
                lastReminderAt: true,
                ccCollectionPaymentWaLocked: true,
                customer: {
                    select: {
                        id: true,
                        displayName: true,
                        phone: true,
                        phone2: true,
                        originBranch: { select: { name: true } },
                    },
                },
                driver: {
                    select: {
                        fullName: true,
                        branch: { select: { name: true } },
                    },
                },
                lineItems: {
                    select: {
                        label: true,
                        quantity: true,
                        unitPrice: true,
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        const debtCandidates = rows.filter((r) => r.posPaymentMethod === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT);
        const openDebtOrderIds = await this.resolveOpenDebtOrderIds(debtCandidates.map((r) => ({ orderId: r.id, customerId: r.customerId })));
        const filteredRows = rows.filter((r) => {
            if (r.cashStatus === client_1.CashStatus.UNPAID)
                return true;
            if (r.posPaymentMethod === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT) {
                return openDebtOrderIds.has(r.id);
            }
            return false;
        });
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const ORDER_REMINDER_COOLDOWN_MS = 2.5 * 60 * 60 * 1000;
        return filteredRows.map((r) => {
            const phone = r.customer.phone?.replace(/[\s-]/g, '').trim() ||
                r.customer.phone2?.replace(/[\s-]/g, '').trim() ||
                '';
            const name = r.customer.displayName?.trim() ||
                (phone ? phone : 'Customer');
            const ageMs = Math.max(0, now - r.createdAt.getTime());
            const invoiceAgeDays = Math.floor(ageMs / DAY_MS);
            const lastReminderMs = r.lastReminderAt?.getTime() ?? null;
            const canRemindNow = lastReminderMs === null ||
                now - lastReminderMs >= ORDER_REMINDER_COOLDOWN_MS;
            const canSendCollectionPaymentWa = canRemindNow;
            const readableId = r.serialNumber?.trim() ||
                r.invoiceNumber?.trim() ||
                `#${r.id.slice(-6).toUpperCase()}`;
            const lineItems = r.lineItems.map((li) => {
                const lineTotal = li.quantity.mul(li.unitPrice);
                return {
                    label: li.label,
                    quantity: li.quantity.toString(),
                    unitPriceKd: li.unitPrice.toFixed(3),
                    lineTotalKd: lineTotal.toFixed(3),
                };
            });
            const branchName = r.driver?.branch?.name?.trim() ||
                r.customer.originBranch?.name?.trim() ||
                null;
            const driverName = r.driver?.fullName?.trim() || null;
            return {
                orderId: r.id,
                customerId: r.customerId,
                readableId,
                invoiceNumber: r.invoiceNumber ?? null,
                customerName: name,
                customerPhone: phone,
                amountKd: r.totalPrice.toFixed(3),
                paymentMethod: r.posPaymentMethod,
                paymentUrl: r.posHostedPaymentUrl ?? null,
                createdAtIso: r.createdAt.toISOString(),
                invoiceAgeDays,
                reminderCount: r.reminderCount,
                lastReminderAtIso: r.lastReminderAt
                    ? r.lastReminderAt.toISOString()
                    : null,
                canRemindNow,
                ccCollectionPaymentWaLocked: r.ccCollectionPaymentWaLocked,
                canSendCollectionPaymentWa,
                branchName,
                driverName,
                lineItems,
            };
        });
    }
    async sumCollectionsDebtTotalKd(branchId = null, actor) {
        console.log('[ORDERS SCOPE]', branchId, actor?.role ?? null);
        const isDriver = actor?.role === client_1.SafariRole.DRIVER;
        const effectiveBranchId = isDriver ? null
            : branchId ??
                (actor?.role === client_1.SafariRole.MANAGER && actor.branchId ?
                    actor.branchId
                    : null);
        const branchWhere = isDriver
            ? { driverId: actor.userId }
            : effectiveBranchId
                ? {
                    OR: [
                        { driver: { is: { branchId: effectiveBranchId } } },
                        {
                            driverId: null,
                            customer: { is: { originBranchId: effectiveBranchId } },
                        },
                    ],
                }
                : undefined;
        const [unpaidAgg, debtCandidates] = await Promise.all([
            this.prisma.order.aggregate({
                where: {
                    cashStatus: client_1.CashStatus.UNPAID,
                    status: { not: client_1.OrderStatus.CANCELED },
                    ...(branchWhere ?? {}),
                },
                _sum: { totalPrice: true },
            }),
            this.prisma.order.findMany({
                where: {
                    posPaymentMethod: client_1.PosPaymentMethod.DEBT_ON_ACCOUNT,
                    status: { not: client_1.OrderStatus.CANCELED },
                    NOT: { cashStatus: client_1.CashStatus.UNPAID },
                    ...(branchWhere ?? {}),
                },
                select: { id: true, customerId: true, totalPrice: true },
            }),
        ]);
        const openDebtOrderIds = await this.resolveOpenDebtOrderIds(debtCandidates.map((d) => ({
            orderId: d.id,
            customerId: d.customerId,
        })));
        const debtOpenTotal = debtCandidates
            .filter((d) => openDebtOrderIds.has(d.id))
            .reduce((acc, d) => acc.plus(d.totalPrice), new client_1.Prisma.Decimal(0));
        return (unpaidAgg._sum.totalPrice ?? new client_1.Prisma.Decimal(0)).plus(debtOpenTotal);
    }
    async listCollectionsReceivableAggOrders(args) {
        const { branchId, actor, createdAt, driverId, customerId } = args;
        console.log('[ORDERS SCOPE]', branchId, actor?.role ?? null);
        const isDriver = actor?.role === client_1.SafariRole.DRIVER;
        const effectiveBranchId = isDriver ? null
            : branchId ??
                (actor?.role === client_1.SafariRole.MANAGER && actor.branchId ?
                    actor.branchId
                    : null);
        const branchWhere = isDriver
            ? { driverId: actor.userId }
            : effectiveBranchId
                ? {
                    OR: [
                        { driver: { is: { branchId: effectiveBranchId } } },
                        {
                            driverId: null,
                            customer: { is: { originBranchId: effectiveBranchId } },
                        },
                    ],
                }
                : undefined;
        const createdFilter = createdAt && (createdAt.gte || createdAt.lte)
            ? {
                createdAt: {
                    ...(createdAt.gte ? { gte: createdAt.gte } : {}),
                    ...(createdAt.lte ? { lte: createdAt.lte } : {}),
                },
            }
            : {};
        const rows = await this.prisma.order.findMany({
            where: {
                status: { not: client_1.OrderStatus.CANCELED },
                OR: [
                    { cashStatus: client_1.CashStatus.UNPAID },
                    { posPaymentMethod: client_1.PosPaymentMethod.DEBT_ON_ACCOUNT },
                ],
                ...(branchWhere ?? {}),
                ...createdFilter,
                ...(driverId ? { driverId } : {}),
                ...(customerId ? { customerId } : {}),
            },
            select: {
                id: true,
                customerId: true,
                driverId: true,
                totalPrice: true,
                cashStatus: true,
                posPaymentMethod: true,
                createdAt: true,
                dueDate: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        const debtCandidates = rows.filter((r) => r.posPaymentMethod === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT);
        const openDebtOrderIds = await this.resolveOpenDebtOrderIds(debtCandidates.map((r) => ({ orderId: r.id, customerId: r.customerId })));
        return rows
            .filter((r) => {
            if (r.cashStatus === client_1.CashStatus.UNPAID)
                return true;
            if (r.posPaymentMethod === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT) {
                return openDebtOrderIds.has(r.id);
            }
            return false;
        })
            .map((r) => ({
            id: r.id,
            customerId: r.customerId,
            driverId: r.driverId,
            totalPrice: r.totalPrice,
            createdAt: r.createdAt,
            dueDate: r.dueDate,
        }));
    }
    isOrderInCollectionsUncollectedScope(r, debtOnAccountStillOpenIds) {
        if (r.cashStatus === client_1.CashStatus.UNPAID)
            return true;
        if (r.posPaymentMethod === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT &&
            debtOnAccountStillOpenIds.has(r.id)) {
            return true;
        }
        return false;
    }
    async getCollectionsReceivableSnapshotForCustomer(customerId, tx) {
        const db = tx ?? this.prisma;
        const rows = await db.order.findMany({
            where: {
                customerId,
                status: { not: client_1.OrderStatus.CANCELED },
                OR: [
                    { cashStatus: client_1.CashStatus.UNPAID },
                    { posPaymentMethod: client_1.PosPaymentMethod.DEBT_ON_ACCOUNT },
                ],
            },
            select: {
                id: true,
                customerId: true,
                totalPrice: true,
                cashStatus: true,
                posPaymentMethod: true,
            },
        });
        const debtCandidates = rows.filter((r) => r.posPaymentMethod === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT);
        const openDebtOrderIds = await this.resolveOpenDebtOrderIds(debtCandidates.map((r) => ({
            orderId: r.id,
            customerId: r.customerId,
        })), db);
        let totalKd = new client_1.Prisma.Decimal(0);
        const openOrderIds = new Set();
        for (const r of rows) {
            if (!this.isOrderInCollectionsUncollectedScope(r, openDebtOrderIds)) {
                continue;
            }
            totalKd = totalKd.plus(r.totalPrice);
            openOrderIds.add(r.id);
        }
        return { totalKd, openOrderIds };
    }
    async sumCollectionsReceivableKdForCustomer(customerId, tx) {
        const { totalKd } = await this.getCollectionsReceivableSnapshotForCustomer(customerId, tx);
        return totalKd;
    }
    async getOperationalDebtKdBreakdown(customerId, embeddedWalletDebt, tx) {
        const db = tx ?? this.prisma;
        let walletDebtKd;
        if (embeddedWalletDebt !== undefined) {
            walletDebtKd =
                embeddedWalletDebt ?? new client_1.Prisma.Decimal(0);
        }
        else {
            const row = await db.customerWallet.findUnique({
                where: { customerId },
                select: { debt: true },
            });
            walletDebtKd = row?.debt ?? new client_1.Prisma.Decimal(0);
        }
        const ledgerOpen = await (0, debt_customer_aggregates_util_1.getCustomerNetDebtFromDebtLedgerAgg)(db, customerId);
        const snapshotFromWalletKd = await (0, debt_customer_aggregates_util_1.getCustomerDebtSnapshotTotalKd)(db, customerId);
        const collectionsSnap = await this.getCollectionsReceivableSnapshotForCustomer(customerId, tx);
        const z = new client_1.Prisma.Decimal(0);
        const ledgerNetKd = ledgerOpen.netOpenDebtKd;
        const orderMarketScopeKd = walletDebtKd.plus(collectionsSnap.totalKd);
        const operationalDebtKd = client_1.Prisma.Decimal.max(ledgerNetKd, snapshotFromWalletKd, orderMarketScopeKd);
        const collectionsReceivableKd = client_1.Prisma.Decimal.max(operationalDebtKd.sub(walletDebtKd), z);
        const unpaidIds = await db.order.findMany({
            where: {
                customerId,
                status: { not: client_1.OrderStatus.CANCELED },
                cashStatus: client_1.CashStatus.UNPAID,
            },
            select: { id: true },
        });
        const collectionsOpenOrderIds = new Set(collectionsSnap.openOrderIds);
        for (const u of unpaidIds) {
            collectionsOpenOrderIds.add(u.id);
        }
        const expose = process.env.EXPOSE_DEBT_BREAKDOWN?.trim().toLowerCase() === '1' ||
            process.env.EXPOSE_DEBT_BREAKDOWN?.trim().toLowerCase() === 'true';
        let trace;
        if (expose) {
            trace = (0, debt_kd_breakdown_util_1.buildDebtKdBreakdownTrace)(ledgerNetKd, snapshotFromWalletKd, orderMarketScopeKd, operationalDebtKd);
            this.log.warn(`[debtKdBreakdown] customerId=${customerId} ledger=${trace.ledgerNetKd} walletSnap=${trace.walletSnapshotKd} orderMarket=${trace.orderMarketScopeKd} operational=${trace.operationalDebtKd} winners=[${trace.winningSources.join(',')}]`);
        }
        return {
            walletDebtKd,
            collectionsReceivableKd,
            operationalDebtKd,
            effectiveDebtKd: operationalDebtKd,
            collectionsOpenOrderIds,
            trace,
        };
    }
    async getEffectiveDebtKdBreakdown(customerId, embeddedWalletDebt, tx) {
        return this.getOperationalDebtKdBreakdown(customerId, embeddedWalletDebt, tx);
    }
    async getCollectionsOpenOrderIdsForCustomer(customerId) {
        const { openOrderIds } = await this.getCollectionsReceivableSnapshotForCustomer(customerId);
        return openOrderIds;
    }
    async getUnpaidCollectionOrderRowForWhatsappText(orderId) {
        const r = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                cashStatus: client_1.CashStatus.UNPAID,
                status: { not: client_1.OrderStatus.CANCELED },
            },
            select: {
                id: true,
                serialNumber: true,
                invoiceNumber: true,
                totalPrice: true,
                customer: {
                    select: {
                        displayName: true,
                        phone: true,
                        phone2: true,
                        originBranch: { select: { name: true } },
                    },
                },
                driver: {
                    select: {
                        fullName: true,
                        branch: { select: { name: true } },
                    },
                },
                lineItems: {
                    select: {
                        label: true,
                        quantity: true,
                        unitPrice: true,
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        if (!r) {
            return null;
        }
        const phone = r.customer.phone?.replace(/[\s-]/g, '').trim() ||
            r.customer.phone2?.replace(/[\s-]/g, '').trim() ||
            '';
        const name = r.customer.displayName?.trim() || (phone ? phone : 'Customer');
        const readableId = r.serialNumber?.trim() ||
            r.invoiceNumber?.trim() ||
            `#${r.id.slice(-6).toUpperCase()}`;
        const lineItems = r.lineItems.map((li) => {
            const lineTotal = li.quantity.mul(li.unitPrice);
            return {
                label: li.label,
                quantity: li.quantity.toString(),
                lineTotalKd: lineTotal.toFixed(3),
            };
        });
        const branchName = r.driver?.branch?.name?.trim() ||
            r.customer.originBranch?.name?.trim() ||
            null;
        const driverName = r.driver?.fullName?.trim() || null;
        return {
            orderId: r.id,
            readableId,
            invoiceNumber: r.invoiceNumber ?? null,
            customerName: name,
            customerPhone: phone,
            customerPhone2: r.customer.phone2?.replace(/[\s-]/g, '').trim() || null,
            amountKd: r.totalPrice.toFixed(3),
            lineItems,
            branchName,
            driverName,
        };
    }
    async listUnpaidOnlinePaymentOrders() {
        return this.listUnpaidCollectionOrders(null, undefined);
    }
    async listDriverPendingInvoices(userId) {
        const rows = await this.prisma.order.findMany({
            where: {
                driverId: userId,
                status: { not: client_1.OrderStatus.CANCELED },
                OR: [
                    { cashStatus: client_1.CashStatus.UNPAID },
                    { posPaymentMethod: client_1.PosPaymentMethod.DEBT_ON_ACCOUNT },
                ],
            },
            select: {
                id: true,
                serialNumber: true,
                invoiceNumber: true,
                totalPrice: true,
                posPaymentMethod: true,
                cashStatus: true,
                status: true,
                notes: true,
                createdAt: true,
                customerId: true,
                posHostedPaymentUrl: true,
                customer: { select: { displayName: true, phone: true, phone2: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        const debtCandidates = rows.filter((r) => r.posPaymentMethod === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT);
        const openDebtOrderIds = await this.resolveOpenDebtOrderIds(debtCandidates.map((r) => ({ orderId: r.id, customerId: r.customerId })));
        const filtered = rows.filter((r) => {
            if (r.cashStatus === client_1.CashStatus.UNPAID)
                return true;
            if (r.posPaymentMethod === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT) {
                return openDebtOrderIds.has(r.id);
            }
            return false;
        });
        const now = Date.now();
        return filtered.map((r) => {
            const phone = r.customer.phone?.replace(/[\s-]/g, '').trim() ||
                r.customer.phone2?.replace(/[\s-]/g, '').trim() ||
                '';
            const name = r.customer.displayName?.trim() || (phone ? phone : 'Customer');
            const readableId = r.serialNumber?.trim() ||
                r.invoiceNumber?.trim() ||
                `#${r.id.slice(-6).toUpperCase()}`;
            let linkStatus = null;
            if (r.posPaymentMethod === client_1.PosPaymentMethod.ONLINE &&
                r.cashStatus === client_1.CashStatus.UNPAID &&
                typeof r.posHostedPaymentUrl === 'string' &&
                r.posHostedPaymentUrl.length > 0) {
                const ageMs = now - r.createdAt.getTime();
                linkStatus =
                    ageMs <= PAYMENT_LINK_VALIDITY_MS ? 'PENDING' : 'EXPIRED';
            }
            return {
                orderId: r.id,
                readableId,
                invoiceNumber: r.invoiceNumber ?? null,
                customerName: name,
                customerPhone: phone,
                amountKd: r.totalPrice.toFixed(3),
                paymentMethod: r.posPaymentMethod,
                notes: r.notes?.trim() || null,
                orderStatus: r.status,
                linkStatus,
                createdAtIso: r.createdAt.toISOString(),
            };
        });
    }
    async listInvoiceFilterDrivers(role, branchId) {
        const where = {
            role: { name: client_1.SafariRole.DRIVER },
            isActive: true,
        };
        if (role === client_1.SafariRole.MANAGER) {
            if (!branchId)
                return [];
            where.branchId = branchId;
        }
        const rows = await this.prisma.user.findMany({
            where,
            select: {
                id: true,
                fullName: true,
                username: true,
                branchId: true,
                branch: { select: { name: true } },
            },
            orderBy: { fullName: 'asc' },
        });
        return rows.map((r) => ({
            id: r.id,
            fullName: r.fullName,
            username: r.username,
            branchId: r.branchId,
            branchName: r.branch?.name ?? null,
        }));
    }
    async listStaleQuickOrderRisks() {
        const cutoff = new Date(Date.now() - exports.STALE_QUICK_ORDER_THRESHOLD_MS);
        const rows = await this.prisma.order.findMany({
            where: {
                status: client_1.OrderStatus.PENDING,
                cashStatus: client_1.CashStatus.UNPAID,
                createdAt: { lt: cutoff },
                driverId: { not: null },
            },
            select: {
                id: true,
                serialNumber: true,
                invoiceNumber: true,
                totalPrice: true,
                posPaymentMethod: true,
                createdAt: true,
                driver: {
                    select: { id: true, fullName: true, phone: true },
                },
                customer: {
                    select: { displayName: true, phone: true, phone2: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
        const now = Date.now();
        return rows.map((r) => {
            const phone = r.customer.phone?.replace(/[\s-]/g, '').trim() ||
                r.customer.phone2?.replace(/[\s-]/g, '').trim() ||
                '';
            const customerName = r.customer.displayName?.trim() || (phone ? phone : 'Customer');
            const driverName = r.driver?.fullName?.trim() || '—';
            const readableId = r.serialNumber?.trim() ||
                r.invoiceNumber?.trim() ||
                `#${r.id.slice(-6).toUpperCase()}`;
            const ageHours = Math.round((now - r.createdAt.getTime()) / (60 * 60 * 1000));
            return {
                orderId: r.id,
                readableId,
                driverName,
                driverPhone: r.driver?.phone ?? null,
                customerName,
                customerPhone: phone,
                amountKd: r.totalPrice.toFixed(3),
                paymentMethod: r.posPaymentMethod,
                ageHours,
                createdAtIso: r.createdAt.toISOString(),
            };
        });
    }
    async resolveOpenDebtOrderIds(candidates, db = this.prisma) {
        const openIds = new Set();
        if (candidates.length === 0)
            return openIds;
        const customerIds = Array.from(new Set(candidates.map((c) => c.customerId)));
        const shortfallEntries = await db.debtLedgerEntry.findMany({
            where: {
                source: client_1.DebtSource.INVOICE_SHORTFALL,
                customerId: { in: customerIds },
                orderId: { not: null },
            },
            select: {
                orderId: true,
                customerId: true,
                amount: true,
                order: {
                    select: { id: true, createdAt: true, completedAt: true },
                },
            },
        });
        const perOrder = new Map();
        for (const e of shortfallEntries) {
            if (!e.orderId || !e.order)
                continue;
            const amount = Number.parseFloat(e.amount.toString());
            if (!Number.isFinite(amount))
                continue;
            const cur = perOrder.get(e.orderId);
            if (cur) {
                cur.shortfall += amount;
            }
            else {
                perOrder.set(e.orderId, {
                    orderId: e.orderId,
                    customerId: e.customerId,
                    issuedAt: e.order.completedAt ?? e.order.createdAt,
                    shortfall: amount,
                    paid: 0,
                });
            }
        }
        const allOrderIds = Array.from(perOrder.keys());
        if (allOrderIds.length === 0)
            return openIds;
        const perOrderPayments = await db.debtLedgerEntry.findMany({
            where: {
                source: client_1.DebtSource.PAYMENT,
                orderId: { in: allOrderIds },
            },
            select: {
                orderId: true,
                source: true,
                amount: true,
                actorUserId: true,
                sourceRef: true,
                note: true,
            },
        });
        for (const g of perOrderPayments) {
            if (!g.orderId)
                continue;
            if (!(0, debt_ledger_payment_origin_util_1.isRealDebtLedgerPayment)(g))
                continue;
            const paid = Number.parseFloat(g.amount?.toString() ?? '0');
            const cur = perOrder.get(g.orderId);
            if (cur && Number.isFinite(paid))
                cur.paid += paid;
        }
        const customerTotals = await db.debtLedgerEntry.findMany({
            where: { customerId: { in: customerIds } },
            select: {
                customerId: true,
                source: true,
                amount: true,
                actorUserId: true,
                sourceRef: true,
                note: true,
            },
        });
        const debtByCust = new Map();
        const paidByCust = new Map();
        for (const g of customerTotals) {
            const v = Number.parseFloat(g.amount?.toString() ?? '0');
            if (!Number.isFinite(v))
                continue;
            if (g.source === client_1.DebtSource.PAYMENT) {
                if (!(0, debt_ledger_payment_origin_util_1.isRealDebtLedgerPayment)(g))
                    continue;
                paidByCust.set(g.customerId, (paidByCust.get(g.customerId) ?? 0) + v);
            }
            else {
                debtByCust.set(g.customerId, (debtByCust.get(g.customerId) ?? 0) + v);
            }
        }
        const byCustomer = new Map();
        for (const agg of perOrder.values()) {
            const arr = byCustomer.get(agg.customerId) ?? [];
            arr.push(agg);
            byCustomer.set(agg.customerId, arr);
        }
        for (const [cid, arr] of byCustomer) {
            arr.sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());
            const debtTotal = debtByCust.get(cid) ?? 0;
            const paidTotal = paidByCust.get(cid) ?? 0;
            let remainingOpen = Math.max(debtTotal - paidTotal, 0);
            for (const item of arr) {
                const perOrderNet = Math.max(item.shortfall - item.paid, 0);
                const share = Math.min(perOrderNet, remainingOpen);
                if (share > 0.0001)
                    openIds.add(item.orderId);
                remainingOpen -= share;
            }
        }
        return openIds;
    }
    async sumUnpaidCollectionAmount() {
        const agg = await this.prisma.order.aggregate({
            _sum: { totalPrice: true },
            where: {
                cashStatus: client_1.CashStatus.UNPAID,
                status: { not: client_1.OrderStatus.CANCELED },
            },
        });
        return agg._sum.totalPrice ?? new client_1.Prisma.Decimal(0);
    }
    async findAllForActor(userId, role, branchId, filters = {}) {
        const where = {};
        if (role === client_1.SafariRole.DRIVER) {
            where.driverId = userId;
        }
        else if (role === client_1.SafariRole.MANAGER) {
            if (!branchId) {
                return [];
            }
            where.driver = { branchId };
        }
        else if (!this.canViewAllOrders(role)) {
            return [];
        }
        if (filters.driverId) {
            if (role === client_1.SafariRole.DRIVER && filters.driverId !== userId) {
                return [];
            }
            where.driverId = filters.driverId;
            delete where.driver;
        }
        if (filters.status) {
            where.status = filters.status;
        }
        if (filters.posPaymentMethod) {
            where.posPaymentMethod = filters.posPaymentMethod;
        }
        if (filters.cashStatus) {
            where.cashStatus = filters.cashStatus;
        }
        if (filters.from || filters.to) {
            where.createdAt = {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
            };
        }
        if (filters.q && filters.q.trim().length > 0) {
            const q = filters.q.trim();
            where.OR = [
                { invoiceNumber: { contains: q, mode: 'insensitive' } },
                { serialNumber: { contains: q, mode: 'insensitive' } },
                { customer: { phone: { contains: q } } },
                { customer: { phone2: { contains: q } } },
                { customer: { displayName: { contains: q, mode: 'insensitive' } } },
            ];
        }
        const rows = await this.prisma.order.findMany({
            where,
            select: orderDetailSelect,
            orderBy: { createdAt: 'desc' },
        });
        if (rows.length === 0) {
            return [];
        }
        const withEdit = await this.prisma.invoiceAuditLog.findMany({
            where: {
                orderId: { in: rows.map((r) => r.id) },
                action: client_1.InvoiceAuditAction.EDIT,
            },
            select: { orderId: true },
            distinct: ['orderId'],
        });
        const editSet = new Set(withEdit.map((a) => a.orderId));
        return rows.map((o) => ({
            ...o,
            hasSupervisorEdit: editSet.has(o.id),
        }));
    }
    async findOneForActor(id, userId, role) {
        const order = await this.prisma.order.findUnique({
            where: { id },
            select: orderDetailSelect,
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (this.canViewAllOrders(role)) {
            return order;
        }
        if (role === client_1.SafariRole.DRIVER && order.driver?.id === userId) {
            return order;
        }
        throw new common_1.ForbiddenException('You cannot view this order');
    }
    async mintInvoiceShareLink(orderId, publicBaseUrl) {
        const exists = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true },
        });
        if (!exists) {
            throw new common_1.NotFoundException('Order not found');
        }
        const token = await this.jwt.signAsync({ purpose: 'INVOICE_SHARE', orderId }, { expiresIn: '7d' });
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const base = publicBaseUrl.replace(/\/$/, '');
        return {
            token,
            shareUrl: `${base}/public/invoice/${encodeURIComponent(token)}`,
            pdfUrl: (0, invoice_pdf_util_1.buildPublicInvoicePdfUrl)(token),
            expiresAtIso: expiresAt.toISOString(),
        };
    }
    normalizePublicInvoiceTokenParam(raw) {
        const t = (raw ?? '').trim();
        if (!t) {
            return t;
        }
        try {
            return decodeURIComponent(t);
        }
        catch {
            return t;
        }
    }
    async getPublicInvoicePdfStream(token) {
        const normalized = this.normalizePublicInvoiceTokenParam(token);
        const order = await this.getOrderForPublicInvoiceToken(normalized);
        const inv = order.invoiceNumber?.trim() ||
            order.serialNumber?.trim() ||
            order.id.slice(0, 8);
        const safe = inv.replace(/[^\w\u0600-\u06FF-]+/g, '_');
        const filename = `invoice-${safe}.pdf`;
        const stream = new node_stream_1.PassThrough();
        const doc = new pdfkit_1.default({
            size: 'A4',
            margin: 40,
            info: { Title: `Invoice ${inv}` },
        });
        doc.on('error', (err) => stream.destroy(err));
        doc.pipe(stream);
        doc.fillColor('#0f766e').fontSize(16).text('Safari Omni — Invoice', {
            align: 'center',
        });
        doc.moveDown(0.4);
        doc.fillColor('#0f172a').fontSize(10).text(`Serial: ${inv}`);
        doc.text(`Date: ${order.createdAt.toLocaleString('en-GB', { timeZone: 'Asia/Kuwait' })}`);
        doc.text(`Total: ${order.totalPrice.toFixed(3)} KWD`);
        if (order.customer?.phone) {
            doc.text(`Phone: ${order.customer.phone}`);
        }
        if (order.driver?.fullName) {
            doc.text(`Driver: ${order.driver.fullName}`);
        }
        if (order.cashStatus === 'PAID_ONLINE') {
            doc.moveDown(0.3);
            doc
                .fillColor('#065f46')
                .fontSize(11)
                .text('PAID ONLINE  /  تم الدفع أونلاين', { align: 'center' });
            doc.fillColor('#0f172a');
        }
        else if (order.cashStatus === 'UNPAID' && order.status !== 'CANCELED') {
            doc.moveDown(0.3);
            doc
                .fillColor('#92400e')
                .fontSize(10)
                .text('UNPAID / الفاتورة لم تُسدَّد بعد', { align: 'center' });
            doc.fillColor('#0f172a');
        }
        doc.moveDown(0.4);
        doc
            .fillColor('#0f172a')
            .fontSize(9)
            .text('Line items', { underline: true });
        const lines = [...order.lineItems].sort((a, b) => a.id.localeCompare(b.id));
        for (const li of lines) {
            const unit = Number(li.unitPrice);
            const qty = Number(li.quantity);
            const sub = (unit * qty).toFixed(3);
            const label = (li.label ?? 'Item').replace(/\s+/g, ' ');
            doc.text(`• ${label}  x${String(qty)}  @${unit.toFixed(3)} KWD  =  ${sub} KWD`, { width: 515 });
        }
        doc.end();
        return { stream, filename };
    }
    async getOrderForPublicInvoiceToken(token) {
        const normalized = this.normalizePublicInvoiceTokenParam(token);
        let payload;
        try {
            payload = await this.jwt.verifyAsync(normalized);
        }
        catch (e) {
            const name = e && typeof e === 'object' && 'name' in e ?
                String(e.name)
                : '';
            if (name === 'TokenExpiredError') {
                throw new common_1.NotFoundException('رابط الفاتورة منتهي الصلاحية');
            }
            if (name === 'JsonWebTokenError' || name === 'NotBeforeError') {
                throw new common_1.NotFoundException('رابط الفاتورة غير صالح — انسخ التوكن كاملاً، أو راجع تطابق JWT_SECRET بين البيئات');
            }
            throw new common_1.NotFoundException('رابط الفاتورة غير صالح أو منتهي الصلاحية');
        }
        if (payload.purpose !== 'INVOICE_SHARE' || !payload.orderId) {
            throw new common_1.NotFoundException('رابط الفاتورة غير صالح');
        }
        const order = await this.prisma.order.findUnique({
            where: { id: payload.orderId },
            select: orderDetailSelect,
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    async assignDriver(orderId, dto) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (terminalStatuses.includes(order.status)) {
            throw new common_1.ForbiddenException('Cannot assign a driver to a completed or canceled order');
        }
        await this.assertDriverUser(dto.driverId);
        await (0, administrative_branch_util_1.assertUserNotOnAdministrativeBranchForSales)(this.prisma, dto.driverId);
        return this.prisma.order.update({
            where: { id: orderId },
            data: { driverId: dto.driverId },
            select: orderDetailSelect,
        });
    }
    async updateOrder(orderId, dto, userId, role) {
        if (dto.status === undefined && dto.notes === undefined) {
            throw new common_1.BadRequestException('Send at least one of: status, notes');
        }
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                driverId: true,
                status: true,
                cashStatus: true,
                posPaymentMethod: true,
                walletSettledAt: true,
                customerId: true,
                totalPrice: true,
            },
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (role === client_1.SafariRole.DRIVER) {
            if (order.driverId !== userId) {
                throw new common_1.ForbiddenException('You may only update orders assigned to you');
            }
        }
        else if (!this.canStaffUpdateOrders(role)) {
            throw new common_1.ForbiddenException('Your role cannot update orders');
        }
        if (dto.status !== undefined && dto.status !== order.status) {
            (0, order_status_machine_1.assertOrderStatusTransition)(order.status, dto.status, !!order.driverId);
        }
        const willBeCompleted = dto.status !== undefined
            ? dto.status === client_1.OrderStatus.COMPLETED
            : order.status === client_1.OrderStatus.COMPLETED;
        const data = {};
        if (dto.status !== undefined)
            data.status = dto.status;
        if (dto.notes !== undefined)
            data.notes = dto.notes;
        if (dto.status === client_1.OrderStatus.COMPLETED &&
            dto.status !== order.status &&
            order.cashStatus === client_1.CashStatus.UNPAID) {
            data.cashStatus = (0, cash_status_for_method_1.cashStatusForPaymentMethod)(order.posPaymentMethod);
        }
        if (dto.status === client_1.OrderStatus.COMPLETED && dto.status !== order.status) {
            data.completedAt = new Date();
        }
        const transitionedToCompleted = dto.status === client_1.OrderStatus.COMPLETED && dto.status !== order.status;
        const notifyDriverManualCollection = transitionedToCompleted &&
            !order.walletSettledAt &&
            order.cashStatus === client_1.CashStatus.UNPAID &&
            (order.posPaymentMethod === client_1.PosPaymentMethod.CASH ||
                order.posPaymentMethod === client_1.PosPaymentMethod.KNET);
        const updated = await this.prisma.$transaction(async (tx) => {
            await tx.order.update({
                where: { id: orderId },
                data,
            });
            if (!order.walletSettledAt && willBeCompleted) {
                await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(tx, orderId, userId);
            }
            return tx.order.findUniqueOrThrow({
                where: { id: orderId },
                select: orderDetailSelect,
            });
        }, { maxWait: 10_000, timeout: 15_000 });
        if (notifyDriverManualCollection) {
            const phone = (0, kuwait_customer_phone_1.resolveCustomerPhoneForNotify)(updated.customer.phone, updated.customer.phone2);
            if (phone.trim()) {
                const paymentMethodLabelAr = order.posPaymentMethod === client_1.PosPaymentMethod.CASH
                    ? 'الكاش'
                    : 'الكي نت';
                this.customerNotifications.notifyDriverCollectionConfirmed({
                    customerPhone: phone,
                    orderId: updated.id,
                    amountKd: updated.totalPrice.toFixed(3),
                    paymentMethodLabelAr,
                });
            }
        }
        return updated;
    }
    async getManagerDashboard() {
        const opsDrivers = await this.prisma.user.findMany({
            where: {
                safariRole: client_1.SafariRole.DRIVER,
                OR: [
                    { branchId: null },
                    { branch: { isAdministrative: false } },
                ],
            },
            select: { id: true },
        });
        const opsDriverIds = new Set(opsDrivers.map((u) => u.id));
        const totalActiveOrders = await this.prisma.order.count({
            where: {
                status: { notIn: terminalStatuses },
                OR: [
                    { driverId: null },
                    { driverId: { in: [...opsDriverIds] } },
                ],
            },
        });
        const agg = await this.prisma.order.aggregate({
            where: {
                status: client_1.OrderStatus.COMPLETED,
                OR: [
                    { driverId: null },
                    { driverId: { in: [...opsDriverIds] } },
                ],
            },
            _sum: { totalPrice: true },
        });
        const sum = agg._sum.totalPrice;
        const grouped = await this.prisma.order.groupBy({
            by: ['driverId'],
            where: {
                status: client_1.OrderStatus.COMPLETED,
                driverId: { in: [...opsDriverIds] },
            },
            _count: true,
            _sum: { totalPrice: true },
        });
        const driverContribution = [];
        for (const row of grouped) {
            if (!row.driverId)
                continue;
            const u = await this.prisma.user.findUnique({
                where: { id: row.driverId },
                select: { username: true, fullName: true, employeeId: true },
            });
            const rev = row._sum.totalPrice;
            driverContribution.push({
                driverId: row.driverId,
                employeeId: u?.employeeId ?? null,
                username: u?.username ?? '(unknown)',
                fullName: u?.fullName ?? '(unknown)',
                completedOrderCount: row._count,
                completedRevenue: rev !== null && rev !== undefined ? rev.toString() : '0',
            });
        }
        driverContribution.sort((a, b) => Number.parseFloat(b.completedRevenue) -
            Number.parseFloat(a.completedRevenue));
        return {
            totalActiveOrders,
            revenueCompletedOrders: sum !== null && sum !== undefined ? sum.toString() : '0',
            driverContribution,
        };
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = OrdersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => customer_ledger_service_1.CustomerLedgerService))),
    __param(9, (0, common_1.Inject)((0, common_1.forwardRef)(() => outstanding_service_1.OutstandingService))),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customer_ledger_service_1.CustomerLedgerService,
        payments_service_1.PaymentsService,
        customer_notifications_service_1.CustomerNotificationsService,
        general_ledger_service_1.GeneralLedgerService,
        serial_counter_service_1.SerialCounterService,
        inventory_service_1.InventoryService,
        jwt_1.JwtService,
        customer_blocking_service_1.CustomerBlockingService,
        outstanding_service_1.OutstandingService,
        audit_logs_service_1.AuditLogsService,
        event_emitter_1.EventEmitter2])
], OrdersService);
//# sourceMappingURL=orders.service.js.map