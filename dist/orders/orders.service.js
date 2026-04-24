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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var OrdersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = exports.STALE_QUICK_ORDER_THRESHOLD_MS = exports.STALE_QUICK_ORDER_THRESHOLD_HOURS = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const payments_service_1 = require("../common/services/payments.service");
const customer_notifications_service_1 = require("../customer-notifications/customer-notifications.service");
const customer_ledger_service_1 = require("../customer-ledger/customer-ledger.service");
const cash_status_for_method_1 = require("../common/utils/cash-status-for-method");
const kuwait_customer_phone_1 = require("../common/validation/kuwait-customer-phone");
const general_ledger_service_1 = require("../general-ledger/general-ledger.service");
const finance_money_1 = require("../finance/finance-money");
const inventory_service_1 = require("../inventory/inventory.service");
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
    log = new common_1.Logger(OrdersService_1.name);
    constructor(prisma, customerLedger, paymentsService, customerNotifications, generalLedger, serialCounter, inventory, jwt) {
        this.prisma = prisma;
        this.customerLedger = customerLedger;
        this.paymentsService = paymentsService;
        this.customerNotifications = customerNotifications;
        this.generalLedger = generalLedger;
        this.serialCounter = serialCounter;
        this.inventory = inventory;
        this.jwt = jwt;
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
    async posInvoiceNotifyToCustomer(detail, phoneCompact) {
        const phone = (0, kuwait_customer_phone_1.resolveCustomerPhoneForNotify)(detail.customer.phone, detail.customer.phone2, phoneCompact);
        const inv = detail.invoiceNumber?.trim() || `#${detail.id.slice(0, 8)}`;
        const amt = detail.totalPrice.toFixed(4);
        let invoiceShareUrl;
        let invoicePdfUrl;
        try {
            const minted = await this.resolveInvoiceShareForNotify(detail.id);
            if (minted) {
                invoiceShareUrl = minted.shareUrl;
                invoicePdfUrl = minted.pdfUrl;
            }
        }
        catch {
        }
        await this.customerNotifications.deliverInvoiceIssuedNow({
            customerPhone: phone,
            orderId: detail.id,
            invoiceLabel: inv,
            amountKd: amt,
            paymentUrl: detail.paymentLink?.url,
            invoiceShareUrl,
            invoicePdfUrl,
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
        const serviceType = dto.serviceType ?? client_1.ServiceType.NORMAL;
        const lineCreates = this.reconcileLineItems(dto.totalPrice, dto.lineItems);
        const phoneCompact = dto.customerPhone.replace(/[\s-]/g, '').trim();
        return this.prisma.$transaction(async (tx) => {
            const customerId = await this.resolveQuickOrderCustomerId(tx, dto, phoneCompact);
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
    }
    async posCheckout(driverUserId, dto) {
        try {
            if (driverUserId == null || String(driverUserId).trim() === '') {
                throw new common_1.BadRequestException('posCheckout: missing driver/manager id from session');
            }
            await this.assertPosCheckoutActor(driverUserId);
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
                    data: { posHostedPaymentUrl: paymentLink.url },
                });
                const merged = { ...detail, paymentLink };
                await this.posInvoiceNotifyToCustomer(merged, phoneCompact);
                return merged;
            }
            void this.posInvoiceNotifyToCustomer(detail, phoneCompact).catch((e) => this.log.warn(`pos invoice notify: ${e}`));
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
            data: { posHostedPaymentUrl: paymentLink.url },
        });
        {
            const webBase = process.env.PUBLIC_WEB_APP_URL?.trim().replace(/\/$/, '');
            const apiBase = (process.env.PUBLIC_API_URL?.trim() ||
                process.env.PAYMENTS_CALLBACK_PUBLIC_URL?.trim() ||
                '').replace(/\/$/, '');
            const mintBase = webBase || apiBase;
            const invoiceShareItems = [];
            let firstInvoicePdfUrl;
            if (mintBase) {
                for (const o of orders) {
                    try {
                        const { shareUrl, pdfUrl } = await this.mintInvoiceShareLink(o.id, mintBase);
                        if (!firstInvoicePdfUrl && pdfUrl) {
                            firstInvoicePdfUrl = pdfUrl;
                        }
                        const lab = o.invoiceNumber?.trim() ||
                            o.serialNumber?.trim() ||
                            o.id.slice(0, 8);
                        invoiceShareItems.push({ label: lab, url: shareUrl });
                    }
                    catch {
                    }
                }
            }
            const first = orders[0];
            await this.customerNotifications.deliverInvoiceIssuedNow({
                customerPhone: phone,
                orderId: first.id,
                invoiceLabel: orders.length > 1 ?
                    `مجموعة ${orders.length} فواتير`
                    : (first.invoiceNumber?.trim() || `#${first.id.slice(0, 8)}`),
                amountKd: sumDecimal.toFixed(4),
                paymentUrl: paymentLink.url,
                invoiceShareItems: invoiceShareItems.length > 0 ? invoiceShareItems : undefined,
                invoicePdfUrl: firstInvoicePdfUrl,
            });
        }
        return { bundleId, orders, paymentLink };
    }
    async createAsManager(dto) {
        if (dto.driverId) {
            await this.assertDriverUser(dto.driverId);
        }
        const serviceType = dto.serviceType ?? client_1.ServiceType.NORMAL;
        const lineCreates = this.reconcileLineItems(dto.totalPrice, dto.lineItems);
        return this.prisma.$transaction(async (tx) => {
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
            const serialNumber = await this.serialCounter.stampOrderSerial(tx, dto.driverId ?? null);
            return tx.order.create({
                data: {
                    customerId: customer.id,
                    driverId: dto.driverId ?? null,
                    serviceType,
                    totalPrice: dto.totalPrice,
                    status: client_1.OrderStatus.PENDING,
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
    }
    async listUnpaidCollectionOrders(branchId = null) {
        const branchWhere = branchId
            ? {
                OR: [
                    { driver: { is: { branchId } } },
                    {
                        driverId: null,
                        customer: { is: { originBranchId: branchId } },
                    },
                ],
            }
            : undefined;
        const rows = await this.prisma.order.findMany({
            where: {
                cashStatus: client_1.CashStatus.UNPAID,
                status: { not: client_1.OrderStatus.CANCELED },
                ...(branchWhere ?? {}),
            },
            select: {
                id: true,
                serialNumber: true,
                invoiceNumber: true,
                totalPrice: true,
                posPaymentMethod: true,
                posHostedPaymentUrl: true,
                createdAt: true,
                reminderCount: true,
                lastReminderAt: true,
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
            orderBy: { createdAt: 'desc' },
        });
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const ORDER_REMINDER_COOLDOWN_MS = 2.5 * 60 * 60 * 1000;
        return rows.map((r) => {
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
                branchName,
                driverName,
                lineItems,
            };
        });
    }
    async listUnpaidOnlinePaymentOrders() {
        return this.listUnpaidCollectionOrders();
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
                branch: { select: { name: true } },
            },
            orderBy: { fullName: 'asc' },
        });
        return rows.map((r) => ({
            id: r.id,
            fullName: r.fullName,
            username: r.username,
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
    async resolveOpenDebtOrderIds(candidates) {
        const openIds = new Set();
        if (candidates.length === 0)
            return openIds;
        const customerIds = Array.from(new Set(candidates.map((c) => c.customerId)));
        const shortfallEntries = await this.prisma.debtLedgerEntry.findMany({
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
        const perOrderPayments = await this.prisma.debtLedgerEntry.groupBy({
            by: ['orderId'],
            where: {
                source: client_1.DebtSource.PAYMENT,
                orderId: { in: allOrderIds },
            },
            _sum: { amount: true },
        });
        for (const g of perOrderPayments) {
            if (!g.orderId)
                continue;
            const paid = Number.parseFloat(g._sum.amount?.toString() ?? '0');
            const cur = perOrder.get(g.orderId);
            if (cur && Number.isFinite(paid))
                cur.paid = paid;
        }
        const customerTotals = await this.prisma.debtLedgerEntry.groupBy({
            by: ['customerId', 'source'],
            where: { customerId: { in: customerIds } },
            _sum: { amount: true },
        });
        const debtByCust = new Map();
        const paidByCust = new Map();
        for (const g of customerTotals) {
            const v = Number.parseFloat(g._sum.amount?.toString() ?? '0');
            if (!Number.isFinite(v))
                continue;
            if (g.source === client_1.DebtSource.PAYMENT) {
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
        doc
            .fillColor('#0f172a')
            .fontSize(10)
            .text(`Invoice / serial: ${inv}`);
        doc.text(`Date: ${order.createdAt.toLocaleString('en-GB', { timeZone: 'Asia/Kuwait' })}`);
        doc.text(`Order id: ${order.id}`);
        doc.text(`Total: ${order.totalPrice.toFixed(3)} KWD`);
        if (order.customer?.phone) {
            doc.text(`Phone: ${order.customer.phone}`);
        }
        if (order.driver?.fullName) {
            doc.text(`Driver: ${order.driver.fullName}`);
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
        catch {
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
        return this.prisma.$transaction(async (tx) => {
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
    }
    async getManagerDashboard() {
        const totalActiveOrders = await this.prisma.order.count({
            where: { status: { notIn: terminalStatuses } },
        });
        const agg = await this.prisma.order.aggregate({
            where: { status: client_1.OrderStatus.COMPLETED },
            _sum: { totalPrice: true },
        });
        const sum = agg._sum.totalPrice;
        const grouped = await this.prisma.order.groupBy({
            by: ['driverId'],
            where: {
                status: client_1.OrderStatus.COMPLETED,
                driverId: { not: null },
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customer_ledger_service_1.CustomerLedgerService,
        payments_service_1.PaymentsService,
        customer_notifications_service_1.CustomerNotificationsService,
        general_ledger_service_1.GeneralLedgerService,
        serial_counter_service_1.SerialCounterService,
        inventory_service_1.InventoryService,
        jwt_1.JwtService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map