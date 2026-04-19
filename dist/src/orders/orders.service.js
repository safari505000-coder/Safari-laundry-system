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
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const payments_service_1 = require("../common/services/payments.service");
const customer_notifications_service_1 = require("../customer-notifications/customer-notifications.service");
const customer_ledger_service_1 = require("../customer-ledger/customer-ledger.service");
const general_ledger_service_1 = require("../general-ledger/general-ledger.service");
const finance_money_1 = require("../finance/finance-money");
const prisma_service_1 = require("../prisma/prisma.service");
const serial_counter_service_1 = require("../serials/serial-counter.service");
const order_status_machine_1 = require("./order-status.machine");
const order_total_util_1 = require("./order-total.util");
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
let OrdersService = class OrdersService {
    prisma;
    customerLedger;
    paymentsService;
    customerNotifications;
    generalLedger;
    serialCounter;
    constructor(prisma, customerLedger, paymentsService, customerNotifications, generalLedger, serialCounter) {
        this.prisma = prisma;
        this.customerLedger = customerLedger;
        this.paymentsService = paymentsService;
        this.customerNotifications = customerNotifications;
        this.generalLedger = generalLedger;
        this.serialCounter = serialCounter;
    }
    queuePosInvoiceNotify(detail, phoneCompact) {
        const phone = detail.customer.phone?.trim() ||
            detail.customer.phone2?.trim() ||
            phoneCompact;
        const inv = detail.invoiceNumber?.trim() || `#${detail.id.slice(0, 8)}`;
        const amt = detail.totalPrice.toFixed(4);
        this.customerNotifications.notifyInvoiceIssued({
            customerPhone: phone,
            orderId: detail.id,
            invoiceLabel: inv,
            amountKd: amt,
            paymentUrl: detail.paymentLink?.url,
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
                        cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
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
                return created.id;
            }, { maxWait: 10_000, timeout: 15_000 });
            const detail = await this.prisma.order.findUniqueOrThrow({
                where: { id: orderId },
                select: orderDetailSelect,
            });
            if (detail.posPaymentMethod === client_1.PosPaymentMethod.ONLINE &&
                detail.status === client_1.OrderStatus.PENDING) {
                const phone = detail.customer.phone?.trim() ||
                    detail.customer.phone2?.trim() ||
                    phoneCompact;
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
                this.queuePosInvoiceNotify(merged, phoneCompact);
                return merged;
            }
            this.queuePosInvoiceNotify(detail, phoneCompact);
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
        const phone = orders[0].customer.phone?.trim() ||
            orders[0].customer.phone2?.trim() ||
            phoneCompact;
        const paymentLink = await this.paymentsService.createPaymentLink({
            orderId: bundleId,
            amount: sumDecimal,
            customerPhone: phone,
        });
        await this.prisma.order.updateMany({
            where: { posPaymentBundleId: bundleId },
            data: { posHostedPaymentUrl: paymentLink.url },
        });
        const notifyBase = orders[0];
        const merged = {
            ...notifyBase,
            id: bundleId,
            totalPrice: sumDecimal,
            paymentLink,
        };
        this.queuePosInvoiceNotify(merged, phoneCompact);
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
                cashStatus: client_1.CashStatus.UNPAID,
                status: { not: client_1.OrderStatus.CANCELED },
            },
            select: {
                id: true,
                serialNumber: true,
                invoiceNumber: true,
                totalPrice: true,
                posPaymentMethod: true,
                status: true,
                notes: true,
                createdAt: true,
                customer: { select: { displayName: true, phone: true, phone2: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return rows.map((r) => {
            const phone = r.customer.phone?.replace(/[\s-]/g, '').trim() ||
                r.customer.phone2?.replace(/[\s-]/g, '').trim() ||
                '';
            const name = r.customer.displayName?.trim() || (phone ? phone : 'Customer');
            const readableId = r.serialNumber?.trim() ||
                r.invoiceNumber?.trim() ||
                `#${r.id.slice(-6).toUpperCase()}`;
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
                pendingApproval: r.status === client_1.OrderStatus.COMPLETED,
                createdAtIso: r.createdAt.toISOString(),
            };
        });
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
    async findAllForActor(userId, role) {
        if (this.canViewAllOrders(role)) {
            return this.prisma.order.findMany({
                select: orderDetailSelect,
                orderBy: { createdAt: 'desc' },
            });
        }
        if (role === client_1.SafariRole.DRIVER) {
            return this.prisma.order.findMany({
                where: { driverId: userId },
                select: orderDetailSelect,
                orderBy: { createdAt: 'desc' },
            });
        }
        return [];
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
            data.cashStatus = client_1.CashStatus.PAID_TO_DRIVER;
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
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customer_ledger_service_1.CustomerLedgerService,
        payments_service_1.PaymentsService,
        customer_notifications_service_1.CustomerNotificationsService,
        general_ledger_service_1.GeneralLedgerService,
        serial_counter_service_1.SerialCounterService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map