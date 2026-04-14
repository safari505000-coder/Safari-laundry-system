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
const customer_ledger_service_1 = require("../customer-ledger/customer-ledger.service");
const finance_money_1 = require("../finance/finance-money");
const prisma_service_1 = require("../prisma/prisma.service");
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
    notes: true,
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
    constructor(prisma, customerLedger) {
        this.prisma = prisma;
        this.customerLedger = customerLedger;
    }
    isManagerOrOwner(role) {
        return role === client_1.SafariRole.OWNER || role === client_1.SafariRole.MANAGER;
    }
    canViewAllOrders(role) {
        return (this.isManagerOrOwner(role) ||
            role === client_1.SafariRole.CALL_CENTER ||
            role === client_1.SafariRole.ACCOUNTANT ||
            role === client_1.SafariRole.SUPERVISOR ||
            role === client_1.SafariRole.VIEWER);
    }
    canStaffUpdateOrders(role) {
        return (this.isManagerOrOwner(role) || role === client_1.SafariRole.SUPERVISOR);
    }
    async assertDriverUser(id) {
        const u = await this.prisma.user.findUnique({ where: { id } });
        if (!u || u.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.ForbiddenException('The assigned user must have the DRIVER role');
        }
    }
    resolvePosCheckoutPaymentMethod(shortfallMinor, raw) {
        if (shortfallMinor === 0n) {
            return client_1.PosPaymentMethod.SUBSCRIPTION_WALLET;
        }
        const s = String(raw ?? client_1.PosPaymentMethod.CASH)
            .trim()
            .toUpperCase()
            .replace(/-/g, '_');
        if (s === 'KNET') {
            return client_1.PosPaymentMethod.KNET;
        }
        if (s === 'PAYMENT_LINK' ||
            s === 'LINK' ||
            s === 'PAYMENTLINK') {
            return client_1.PosPaymentMethod.PAYMENT_LINK;
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
            return tx.order.create({
                data: {
                    customerId,
                    driverId: driverUserId,
                    serviceType,
                    totalPrice: dto.totalPrice,
                    status: client_1.OrderStatus.PENDING,
                    invoiceNumber: dto.invoiceNumber?.trim() || null,
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
            await this.assertDriverUser(driverUserId);
            if (!Number.isFinite(dto.totalPrice) || dto.totalPrice <= 0) {
                throw new common_1.BadRequestException('totalPrice must be a finite positive number');
            }
            const serviceType = dto.serviceType ?? client_1.ServiceType.NORMAL;
            const lineCreates = this.mapPosCheckoutLineItems(dto.lineItems);
            const phoneCompact = dto.customerPhone.replace(/[\s-]/g, '').trim();
            const totalPriceNum = Number(dto.totalPrice);
            const totalPriceDecimal = new client_1.Prisma.Decimal(totalPriceNum.toFixed(4));
            return await this.prisma.$transaction(async (tx) => {
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
                const completedAt = new Date();
                const created = await tx.order.create({
                    data: {
                        customerId,
                        driverId: driverUserId,
                        serviceType,
                        totalPrice: totalPriceDecimal,
                        status: client_1.OrderStatus.PENDING,
                        invoiceNumber: dto.invoiceNumber?.trim() || null,
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
                await tx.order.update({
                    where: { id: created.id },
                    data: { status: client_1.OrderStatus.PICKED_UP },
                });
                await tx.order.update({
                    where: { id: created.id },
                    data: { status: client_1.OrderStatus.IN_PROGRESS },
                });
                await tx.order.update({
                    where: { id: created.id },
                    data: { status: client_1.OrderStatus.OUT_FOR_DELIVERY },
                });
                await tx.order.update({
                    where: { id: created.id },
                    data: {
                        status: client_1.OrderStatus.COMPLETED,
                        cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                        posPaymentMethod: posPaymentMethodResolved,
                        completedAt,
                    },
                });
                await this.customerLedger.applyOrderWalletSettlementForCompletedOrder(tx, created.id, driverUserId);
                return tx.order.findUniqueOrThrow({
                    where: { id: created.id },
                    select: orderDetailSelect,
                });
            });
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
            return tx.order.create({
                data: {
                    customerId: customer.id,
                    driverId: dto.driverId ?? null,
                    serviceType,
                    totalPrice: dto.totalPrice,
                    status: client_1.OrderStatus.PENDING,
                    invoiceNumber: dto.invoiceNumber?.trim() || null,
                    notes: dto.notes?.trim() || null,
                    ...(lineCreates?.length
                        ? { lineItems: { create: lineCreates } }
                        : {}),
                },
                select: orderDetailSelect,
            });
        });
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
        });
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
        customer_ledger_service_1.CustomerLedgerService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map