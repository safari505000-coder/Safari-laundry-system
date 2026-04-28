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
exports.DebtTransfersService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const general_ledger_service_1 = require("../general-ledger/general-ledger.service");
const prisma_service_1 = require("../prisma/prisma.service");
const DEBT_TRANSFER_INCLUDE = {
    sourceDriver: {
        select: {
            id: true,
            username: true,
            fullName: true,
            safariRole: true,
            branchId: true,
        },
    },
    targetDriver: {
        select: {
            id: true,
            username: true,
            fullName: true,
            safariRole: true,
            branchId: true,
        },
    },
    executedBy: {
        select: { id: true, username: true, fullName: true, safariRole: true },
    },
    cancelledBy: {
        select: { id: true, username: true, fullName: true, safariRole: true },
    },
    orders: {
        include: {
            order: {
                select: {
                    id: true,
                    invoiceNumber: true,
                    serialNumber: true,
                    status: true,
                    cashStatus: true,
                    totalPrice: true,
                    posPaymentMethod: true,
                    completedAt: true,
                    customer: { select: { id: true, displayName: true, phone: true } },
                },
            },
        },
    },
};
const DEBT_TRANSFER_LIST_INCLUDE = {
    sourceDriver: {
        select: {
            id: true,
            username: true,
            fullName: true,
            safariRole: true,
            branchId: true,
        },
    },
    targetDriver: {
        select: {
            id: true,
            username: true,
            fullName: true,
            safariRole: true,
            branchId: true,
        },
    },
    executedBy: {
        select: { id: true, username: true, fullName: true, safariRole: true },
    },
    cancelledBy: {
        select: { id: true, username: true, fullName: true, safariRole: true },
    },
};
let DebtTransfersService = class DebtTransfersService {
    prisma;
    generalLedger;
    constructor(prisma, generalLedger) {
        this.prisma = prisma;
        this.generalLedger = generalLedger;
    }
    async listDrivers() {
        const drivers = await this.prisma.user.findMany({
            where: {
                safariRole: client_1.SafariRole.DRIVER,
                isActive: true,
            },
            orderBy: { fullName: 'asc' },
            select: {
                id: true,
                fullName: true,
                username: true,
                safariRole: true,
                branchId: true,
            },
        });
        return { drivers };
    }
    async getDriverOutstandingOrders(driverId) {
        const orders = await this.prisma.order.findMany({
            where: {
                driverId,
                status: client_1.OrderStatus.COMPLETED,
                cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
            },
            orderBy: { completedAt: 'desc' },
            select: {
                id: true,
                invoiceNumber: true,
                serialNumber: true,
                totalPrice: true,
                posPaymentMethod: true,
                completedAt: true,
                customer: {
                    select: { id: true, displayName: true, phone: true },
                },
            },
        });
        const total = orders.reduce((acc, o) => acc.plus(o.totalPrice), new client_1.Prisma.Decimal(0));
        return {
            driverId,
            orderCount: orders.length,
            totalAmount: total.toFixed(3),
            orders: orders.map((o) => ({
                ...o,
                totalPrice: o.totalPrice.toFixed(3),
            })),
        };
    }
    async create(executorId, executorRole, dto) {
        if (executorRole !== client_1.SafariRole.GENERAL_MANAGER &&
            executorRole !== client_1.SafariRole.ACCOUNTANT) {
            throw new common_1.ForbiddenException('Only GENERAL_MANAGER or ACCOUNTANT may initiate a debt transfer.');
        }
        if (dto.sourceDriverId === dto.targetDriverId) {
            throw new common_1.BadRequestException('Source and target drivers must be different.');
        }
        if (!dto.orderIds || dto.orderIds.length === 0) {
            throw new common_1.BadRequestException('At least one order must be included in the transfer.');
        }
        const [source, target] = await Promise.all([
            this.prisma.user.findUnique({ where: { id: dto.sourceDriverId } }),
            this.prisma.user.findUnique({ where: { id: dto.targetDriverId } }),
        ]);
        if (!source)
            throw new common_1.NotFoundException('Source driver not found.');
        if (!target)
            throw new common_1.NotFoundException('Target driver not found.');
        if (source.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.BadRequestException('Source must be a DRIVER.');
        }
        if (target.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.BadRequestException('Target must be a DRIVER.');
        }
        if (target.isActive === false) {
            throw new common_1.BadRequestException('Target driver is deactivated.');
        }
        const orderIds = Array.from(new Set(dto.orderIds));
        const orders = await this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: {
                id: true,
                driverId: true,
                status: true,
                cashStatus: true,
                totalPrice: true,
            },
        });
        if (orders.length !== orderIds.length) {
            throw new common_1.BadRequestException('One or more orders not found.');
        }
        const invalid = orders.filter((o) => o.driverId !== dto.sourceDriverId ||
            o.status !== client_1.OrderStatus.COMPLETED ||
            o.cashStatus !== client_1.CashStatus.PAID_TO_DRIVER);
        if (invalid.length > 0) {
            throw new common_1.BadRequestException(`Orders must belong to source driver and be COMPLETED + PAID_TO_DRIVER. Invalid count: ${invalid.length}`);
        }
        const alreadyLocked = await this.prisma.debtTransferOrder.findMany({
            where: {
                orderId: { in: orderIds },
                debtTransfer: {
                    status: {
                        in: [
                            client_1.DebtTransferStatus.DRAFT,
                            client_1.DebtTransferStatus.AWAITING_SIGNATURES,
                            client_1.DebtTransferStatus.COMPLETED,
                        ],
                    },
                },
            },
            select: { orderId: true, debtTransferId: true },
        });
        if (alreadyLocked.length > 0) {
            throw new common_1.BadRequestException(`Orders already attached to another transfer: ${alreadyLocked
                .map((l) => l.orderId)
                .join(', ')}`);
        }
        const totalAmount = orders.reduce((acc, o) => acc.plus(o.totalPrice), new client_1.Prisma.Decimal(0));
        const created = await this.prisma.debtTransfer.create({
            data: {
                sourceDriverId: dto.sourceDriverId,
                targetDriverId: dto.targetDriverId,
                totalAmount,
                orderCount: orders.length,
                reason: dto.reason ?? null,
                notes: dto.notes ?? null,
                status: client_1.DebtTransferStatus.AWAITING_SIGNATURES,
                executedById: executorId,
                executedByRole: executorRole,
                orders: {
                    create: orders.map((o) => ({
                        orderId: o.id,
                        amountSnapshot: o.totalPrice,
                    })),
                },
            },
            include: DEBT_TRANSFER_INCLUDE,
        });
        return this.serialize(created);
    }
    async signAsSource(transferId, signerId) {
        const transfer = await this.prisma.debtTransfer.findUnique({
            where: { id: transferId },
        });
        if (!transfer)
            throw new common_1.NotFoundException('Debt transfer not found.');
        if (transfer.status !== client_1.DebtTransferStatus.AWAITING_SIGNATURES) {
            throw new common_1.BadRequestException(`Transfer is not awaiting signatures (current: ${transfer.status}).`);
        }
        if (transfer.sourceDriverId !== signerId) {
            throw new common_1.ForbiddenException('Only the source driver may sign as source.');
        }
        if (transfer.sourceSignedAt) {
            throw new common_1.BadRequestException('Source has already signed.');
        }
        const updated = await this.prisma.debtTransfer.update({
            where: { id: transferId },
            data: { sourceSignedAt: new Date() },
            include: DEBT_TRANSFER_INCLUDE,
        });
        return this.serialize(updated);
    }
    async signAsTarget(transferId, signerId) {
        const transfer = await this.prisma.debtTransfer.findUnique({
            where: { id: transferId },
        });
        if (!transfer)
            throw new common_1.NotFoundException('Debt transfer not found.');
        if (transfer.status !== client_1.DebtTransferStatus.AWAITING_SIGNATURES) {
            throw new common_1.BadRequestException(`Transfer is not awaiting signatures (current: ${transfer.status}).`);
        }
        if (transfer.targetDriverId !== signerId) {
            throw new common_1.ForbiddenException('Only the target driver may sign as target.');
        }
        if (transfer.targetSignedAt) {
            throw new common_1.BadRequestException('Target has already signed.');
        }
        const updated = await this.prisma.debtTransfer.update({
            where: { id: transferId },
            data: { targetSignedAt: new Date() },
            include: DEBT_TRANSFER_INCLUDE,
        });
        return this.serialize(updated);
    }
    async finalize(transferId, executorId, executorRole) {
        if (executorRole !== client_1.SafariRole.GENERAL_MANAGER &&
            executorRole !== client_1.SafariRole.ACCOUNTANT) {
            throw new common_1.ForbiddenException('Only GENERAL_MANAGER or ACCOUNTANT may finalize a debt transfer.');
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const transfer = await tx.debtTransfer.findUnique({
                where: { id: transferId },
                include: { orders: true },
            });
            if (!transfer)
                throw new common_1.NotFoundException('Debt transfer not found.');
            if (transfer.status !== client_1.DebtTransferStatus.AWAITING_SIGNATURES) {
                throw new common_1.BadRequestException(`Transfer is not awaiting signatures (current: ${transfer.status}).`);
            }
            if (!transfer.sourceSignedAt || !transfer.targetSignedAt) {
                throw new common_1.BadRequestException('Both source and target drivers must sign before finalization.');
            }
            const orderIds = transfer.orders.map((o) => o.orderId);
            const currentOrders = await tx.order.findMany({
                where: { id: { in: orderIds } },
                select: {
                    id: true,
                    driverId: true,
                    cashStatus: true,
                    status: true,
                    transferredFromDriverId: true,
                },
            });
            if (currentOrders.length !== orderIds.length) {
                throw new common_1.BadRequestException('One or more orders no longer exist for finalization.');
            }
            const stale = currentOrders.filter((o) => o.driverId !== transfer.sourceDriverId ||
                o.status !== client_1.OrderStatus.COMPLETED ||
                o.cashStatus !== client_1.CashStatus.PAID_TO_DRIVER);
            if (stale.length > 0) {
                throw new common_1.BadRequestException(`Some orders have shifted state since signing (count: ${stale.length}). Cancel and recreate the transfer.`);
            }
            for (const o of currentOrders) {
                await tx.order.update({
                    where: { id: o.id },
                    data: {
                        driverId: transfer.targetDriverId,
                        transferredFromDriverId: o.transferredFromDriverId ?? transfer.sourceDriverId,
                    },
                });
            }
            const metaBase = {
                kind: 'DEBT_TRANSFER',
                transferId: transfer.id,
                sourceDriverId: transfer.sourceDriverId,
                targetDriverId: transfer.targetDriverId,
                orderCount: transfer.orderCount,
            };
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.DEBT_ADJUSTMENT,
                amount: transfer.totalAmount.negated(),
                memo: `Debt transfer out (driver leaving) — ${transfer.id}`,
                metadata: { ...metaBase, direction: 'OUT' },
                actorUserId: transfer.sourceDriverId,
            });
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.DEBT_ADJUSTMENT,
                amount: transfer.totalAmount,
                memo: `Debt transfer in (driver accepting) — ${transfer.id}`,
                metadata: { ...metaBase, direction: 'IN' },
                actorUserId: transfer.targetDriverId,
            });
            const systemSignature = (0, node_crypto_1.randomBytes)(16).toString('hex');
            return tx.debtTransfer.update({
                where: { id: transferId },
                data: {
                    status: client_1.DebtTransferStatus.COMPLETED,
                    finalizedAt: new Date(),
                    systemSignature,
                },
                include: DEBT_TRANSFER_INCLUDE,
            });
        });
        return this.serialize(result);
    }
    async cancel(transferId, cancellerId, cancellerRole, reason) {
        if (cancellerRole !== client_1.SafariRole.GENERAL_MANAGER &&
            cancellerRole !== client_1.SafariRole.ACCOUNTANT) {
            throw new common_1.ForbiddenException('Only GENERAL_MANAGER or ACCOUNTANT may cancel a debt transfer.');
        }
        const transfer = await this.prisma.debtTransfer.findUnique({
            where: { id: transferId },
        });
        if (!transfer)
            throw new common_1.NotFoundException('Debt transfer not found.');
        if (transfer.status !== client_1.DebtTransferStatus.DRAFT &&
            transfer.status !== client_1.DebtTransferStatus.AWAITING_SIGNATURES) {
            throw new common_1.BadRequestException('Only DRAFT or AWAITING_SIGNATURES transfers can be cancelled.');
        }
        const updated = await this.prisma.debtTransfer.update({
            where: { id: transferId },
            data: {
                status: client_1.DebtTransferStatus.CANCELLED,
                cancelledAt: new Date(),
                cancelledById: cancellerId,
                cancelledReason: reason ?? null,
            },
            include: DEBT_TRANSFER_INCLUDE,
        });
        return this.serialize(updated);
    }
    async listMine(userId) {
        const rows = await this.prisma.debtTransfer.findMany({
            where: {
                OR: [{ sourceDriverId: userId }, { targetDriverId: userId }],
            },
            orderBy: { createdAt: 'desc' },
            include: DEBT_TRANSFER_LIST_INCLUDE,
        });
        return { rows: rows.map((r) => this.serialize(r)) };
    }
    async findOne(id) {
        const transfer = await this.prisma.debtTransfer.findUnique({
            where: { id },
            include: DEBT_TRANSFER_INCLUDE,
        });
        if (!transfer)
            throw new common_1.NotFoundException('Debt transfer not found.');
        return this.serialize(transfer);
    }
    async list(filters) {
        const where = {};
        if (filters.status)
            where.status = filters.status;
        if (filters.sourceDriverId)
            where.sourceDriverId = filters.sourceDriverId;
        if (filters.targetDriverId)
            where.targetDriverId = filters.targetDriverId;
        if (filters.executedById)
            where.executedById = filters.executedById;
        if (filters.from || filters.to) {
            where.createdAt = {};
            if (filters.from)
                where.createdAt.gte = new Date(filters.from);
            if (filters.to)
                where.createdAt.lte = new Date(filters.to);
        }
        const take = Math.min(Math.max(filters.limit ?? 50, 1), 200);
        const skip = Math.max(filters.offset ?? 0, 0);
        const [rows, total] = await this.prisma.$transaction([
            this.prisma.debtTransfer.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take,
                skip,
                include: DEBT_TRANSFER_LIST_INCLUDE,
            }),
            this.prisma.debtTransfer.count({ where }),
        ]);
        return {
            total,
            limit: take,
            offset: skip,
            rows: rows.map((r) => this.serialize(r)),
        };
    }
    serialize(t) {
        const withLines = t;
        const lineItems = withLines.orders?.length
            ? withLines.orders.map((line) => ({
                id: line.id,
                amountSnapshot: line.amountSnapshot.toFixed(3),
                order: {
                    ...line.order,
                    totalPrice: line.order.totalPrice.toFixed(3),
                },
            }))
            : [];
        return {
            id: t.id,
            status: t.status,
            totalAmount: t.totalAmount.toFixed(3),
            orderCount: t.orderCount,
            reason: t.reason,
            notes: t.notes,
            sourceDriver: t.sourceDriver,
            targetDriver: t.targetDriver,
            executedBy: t.executedBy,
            executedByRole: t.executedByRole,
            sourceSignedAt: t.sourceSignedAt,
            targetSignedAt: t.targetSignedAt,
            finalizedAt: t.finalizedAt,
            cancelledAt: t.cancelledAt,
            cancelledReason: t.cancelledReason,
            cancelledBy: t.cancelledBy,
            systemSignature: t.systemSignature,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            orders: lineItems,
        };
    }
};
exports.DebtTransfersService = DebtTransfersService;
exports.DebtTransfersService = DebtTransfersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        general_ledger_service_1.GeneralLedgerService])
], DebtTransfersService);
//# sourceMappingURL=debt-transfers.service.js.map