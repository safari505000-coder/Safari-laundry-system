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
var ManagerCustodyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManagerCustodyService = exports.CUSTODY_OVERDUE_MS = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const general_ledger_service_1 = require("../general-ledger/general-ledger.service");
const prisma_service_1 = require("../prisma/prisma.service");
const finance_money_1 = require("../finance/finance-money");
exports.CUSTODY_OVERDUE_MS = 24 * 60 * 60 * 1000;
let ManagerCustodyService = ManagerCustodyService_1 = class ManagerCustodyService {
    prisma;
    generalLedger;
    logger = new common_1.Logger(ManagerCustodyService_1.name);
    constructor(prisma, generalLedger) {
        this.prisma = prisma;
        this.generalLedger = generalLedger;
    }
    async approveReceiptFromDriver(managerId, managerBranchId, dto) {
        const driver = await this.prisma.user.findUnique({
            where: { id: dto.driverId },
            select: { id: true, safariRole: true, branchId: true },
        });
        if (!driver || driver.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.NotFoundException('Driver not found');
        }
        const created = await this.prisma.$transaction(async (tx) => {
            const pending = await tx.order.findMany({
                where: {
                    driverId: dto.driverId,
                    status: client_1.OrderStatus.COMPLETED,
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                    posPaymentMethod: client_1.PosPaymentMethod.CASH,
                },
                select: { id: true, totalPrice: true },
            });
            const systemMinor = (0, finance_money_1.sumOrderMinors)(pending);
            if (dto.declaredHandoverTotal !== undefined) {
                try {
                    (0, finance_money_1.assertDeclaredMatchesLedgerMinor)(systemMinor, dto.declaredHandoverTotal);
                }
                catch (e) {
                    throw new common_1.BadRequestException(e instanceof Error ? e.message : 'Declared total mismatch');
                }
            }
            if (pending.length === 0) {
                throw new common_1.BadRequestException('No cash pending settlement for this driver.');
            }
            const shift = await tx.shift.findFirst({
                where: { driverId: dto.driverId, status: client_1.ShiftStatus.OPEN },
                orderBy: { startedAt: 'desc' },
            });
            const amountString = (0, finance_money_1.minorToAmountString)(systemMinor);
            const ids = pending.map((o) => o.id);
            const updated = await tx.order.updateMany({
                where: {
                    id: { in: ids },
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                    posPaymentMethod: client_1.PosPaymentMethod.CASH,
                },
                data: {
                    cashStatus: client_1.CashStatus.HANDED_OVER_TO_OFFICE,
                    handoverShiftId: shift?.id ?? null,
                },
            });
            if (updated.count !== pending.length) {
                throw new common_1.ConflictException('Concurrent handover detected; not all orders could be settled. Retry.');
            }
            const bag = await tx.managerCashCustody.create({
                data: {
                    managerId,
                    driverId: dto.driverId,
                    branchId: managerBranchId ?? driver.branchId ?? null,
                    shiftId: shift?.id ?? null,
                    amountKd: amountString,
                    settledOrderCount: pending.length,
                    status: client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
                    note: dto.note?.trim() || null,
                },
                include: {
                    manager: {
                        select: { id: true, fullName: true, username: true, phone: true },
                    },
                    driver: {
                        select: { id: true, fullName: true, username: true },
                    },
                    branch: { select: { id: true, name: true } },
                    shift: { select: { id: true, endedAt: true, startedAt: true } },
                },
            });
            return bag;
        });
        return this.toRow(created);
    }
    async uploadDepositSlip(custodyId, managerId, dto) {
        const bag = await this.requireBag(custodyId);
        if (bag.managerId !== managerId) {
            throw new common_1.ForbiddenException('Only the manager who received the cash can upload the deposit slip.');
        }
        if (bag.status !== client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT &&
            bag.status !== client_1.ManagerCashCustodyStatus.REJECTED) {
            throw new common_1.BadRequestException(`Cannot upload slip from status ${bag.status}.`);
        }
        if (dto.declaredDepositTotal !== undefined) {
            const ledgerMinor = (0, finance_money_1.parseFixed4ToMinor)(bag.amountKd.toFixed(4));
            try {
                (0, finance_money_1.assertDeclaredMatchesLedgerMinor)(ledgerMinor, dto.declaredDepositTotal);
            }
            catch (e) {
                throw new common_1.BadRequestException(e instanceof Error ? e.message : 'Declared deposit mismatch');
            }
        }
        const updated = await this.prisma.managerCashCustody.update({
            where: { id: custodyId },
            data: {
                depositSlipUrl: dto.depositSlipUrl,
                slipUploadedAt: new Date(),
                status: client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION,
                rejectedByAccountantId: null,
                rejectedAt: null,
                rejectionReason: null,
                note: dto.note?.trim() || bag.note,
            },
            include: {
                manager: {
                    select: { id: true, fullName: true, username: true, phone: true },
                },
                driver: { select: { id: true, fullName: true, username: true } },
                branch: { select: { id: true, name: true } },
                shift: { select: { id: true, endedAt: true, startedAt: true } },
            },
        });
        if (updated.shiftId) {
            await this.prisma.shift.update({
                where: { id: updated.shiftId },
                data: { bankDepositReceiptUrl: dto.depositSlipUrl },
            });
        }
        return this.toRow(updated);
    }
    async verifyCustody(custodyId, accountantId, dto) {
        const bag = await this.requireBag(custodyId);
        if (bag.status !== client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION) {
            throw new common_1.BadRequestException(`Only bags in AWAITING_VERIFICATION can be verified (got ${bag.status}).`);
        }
        const updated = await this.prisma.$transaction(async (tx) => {
            const row = await tx.managerCashCustody.update({
                where: { id: custodyId },
                data: {
                    status: client_1.ManagerCashCustodyStatus.VERIFIED,
                    verifiedByAccountantId: accountantId,
                    verifiedAt: new Date(),
                    note: dto.note?.trim() || bag.note,
                },
                include: {
                    manager: {
                        select: { id: true, fullName: true, username: true, phone: true },
                    },
                    driver: { select: { id: true, fullName: true, username: true } },
                    branch: { select: { id: true, name: true } },
                    shift: { select: { id: true, endedAt: true, startedAt: true } },
                },
            });
            await this.generalLedger.append(tx, {
                entryType: client_1.GeneralLedgerEntryType.WALLET_SETTLEMENT,
                amount: row.amountKd,
                memo: 'manager custody verified',
                actorUserId: accountantId,
                metadata: {
                    event: 'CUSTODY_VERIFIED',
                    custodyId: row.id,
                    managerId: row.managerId,
                    driverId: row.driverId,
                    branchId: row.branchId,
                    shiftId: row.shiftId,
                    settledOrderCount: row.settledOrderCount,
                },
            });
            return row;
        });
        return this.toRow(updated);
    }
    async rejectCustody(custodyId, accountantId, dto) {
        const bag = await this.requireBag(custodyId);
        if (bag.status !== client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION) {
            throw new common_1.BadRequestException(`Only bags in AWAITING_VERIFICATION can be rejected (got ${bag.status}).`);
        }
        const updated = await this.prisma.managerCashCustody.update({
            where: { id: custodyId },
            data: {
                status: client_1.ManagerCashCustodyStatus.REJECTED,
                rejectedByAccountantId: accountantId,
                rejectedAt: new Date(),
                rejectionReason: dto.rejectionReason.trim(),
            },
            include: {
                manager: {
                    select: { id: true, fullName: true, username: true, phone: true },
                },
                driver: { select: { id: true, fullName: true, username: true } },
                branch: { select: { id: true, name: true } },
                shift: { select: { id: true, endedAt: true, startedAt: true } },
            },
        });
        return this.toRow(updated);
    }
    async listMine(managerId) {
        const rows = await this.prisma.managerCashCustody.findMany({
            where: { managerId },
            orderBy: { receivedFromDriverAt: 'desc' },
            take: 200,
            include: {
                manager: {
                    select: { id: true, fullName: true, username: true, phone: true },
                },
                driver: { select: { id: true, fullName: true, username: true } },
                branch: { select: { id: true, name: true } },
                shift: { select: { id: true, endedAt: true, startedAt: true } },
            },
        });
        return rows.map((r) => this.toRow(r));
    }
    async listAging(query) {
        const where = {};
        if (query.status) {
            where.status = query.status;
        }
        else {
            where.status = {
                in: [
                    client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
                    client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION,
                    client_1.ManagerCashCustodyStatus.REJECTED,
                ],
            };
        }
        if (query.managerId)
            where.managerId = query.managerId;
        if (query.branchId)
            where.branchId = query.branchId;
        const rows = await this.prisma.managerCashCustody.findMany({
            where,
            orderBy: { receivedFromDriverAt: 'asc' },
            take: 500,
            include: {
                manager: {
                    select: { id: true, fullName: true, username: true, phone: true },
                },
                driver: { select: { id: true, fullName: true, username: true } },
                branch: { select: { id: true, name: true } },
                shift: { select: { id: true, endedAt: true, startedAt: true } },
            },
        });
        const decorated = rows.map((r) => this.toRow(r));
        return { rows: decorated, summary: this.summarise(decorated) };
    }
    async getStreamMetrics() {
        const rows = await this.prisma.managerCashCustody.findMany({
            where: {
                status: {
                    in: [
                        client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
                        client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION,
                        client_1.ManagerCashCustodyStatus.REJECTED,
                    ],
                },
            },
            select: {
                managerId: true,
                amountKd: true,
                receivedFromDriverAt: true,
                status: true,
            },
        });
        const now = Date.now();
        let overdueMinor = 0n;
        let pendingMinor = 0n;
        let overdueCount = 0;
        const byManager = new Map();
        for (const r of rows) {
            const minor = (0, finance_money_1.parseFixed4ToMinor)(r.amountKd.toFixed(4));
            pendingMinor += minor;
            const age = now - r.receivedFromDriverAt.getTime();
            if (age >= exports.CUSTODY_OVERDUE_MS) {
                overdueCount += 1;
                overdueMinor += minor;
            }
            const acc = byManager.get(r.managerId) ?? { count: 0, minor: 0n };
            acc.count += 1;
            acc.minor += minor;
            byManager.set(r.managerId, acc);
        }
        return {
            fleetOverdueCount: overdueCount,
            fleetOverdueAmountKd: (0, finance_money_1.minorToAmountString)(overdueMinor),
            fleetPendingAmountKd: (0, finance_money_1.minorToAmountString)(pendingMinor),
            pendingByManager: [...byManager.entries()].map(([managerId, v]) => ({
                managerId,
                count: v.count,
                amountKd: (0, finance_money_1.minorToAmountString)(v.minor),
            })),
        };
    }
    async requireBag(custodyId) {
        const bag = await this.prisma.managerCashCustody.findUnique({
            where: { id: custodyId },
        });
        if (!bag)
            throw new common_1.NotFoundException('Custody bag not found.');
        return bag;
    }
    toRow(r) {
        const ageMs = Date.now() - r.receivedFromDriverAt.getTime();
        const ageHours = Math.max(0, Math.floor(ageMs / (60 * 60 * 1000)));
        const isUnsettled = r.status !== client_1.ManagerCashCustodyStatus.VERIFIED;
        return {
            id: r.id,
            managerId: r.managerId,
            managerName: r.manager.fullName,
            managerUsername: r.manager.username,
            managerPhone: r.manager.phone,
            driverId: r.driverId,
            driverName: r.driver.fullName,
            driverUsername: r.driver.username,
            branchId: r.branchId,
            branchName: r.branch?.name ?? null,
            shiftId: r.shiftId,
            amountKd: r.amountKd.toFixed(4),
            settledOrderCount: r.settledOrderCount,
            status: r.status,
            receivedFromDriverAt: r.receivedFromDriverAt.toISOString(),
            slipUploadedAt: r.slipUploadedAt?.toISOString() ?? null,
            depositSlipUrl: r.depositSlipUrl,
            verifiedAt: r.verifiedAt?.toISOString() ?? null,
            rejectedAt: r.rejectedAt?.toISOString() ?? null,
            rejectionReason: r.rejectionReason,
            createdAt: r.createdAt.toISOString(),
            ageHours,
            isOverdue: isUnsettled && ageMs >= exports.CUSTODY_OVERDUE_MS,
        };
    }
    summarise(rows) {
        let pendingMinor = 0n;
        let overdueMinor = 0n;
        const bucket = {
            FRESH: 0,
            WARNING_12H: 0,
            OVERDUE_24H: 0,
        };
        let pendingCount = 0;
        let awaitingCount = 0;
        let overdueCount = 0;
        for (const r of rows) {
            const minor = (0, finance_money_1.parseFixed4ToMinor)(r.amountKd);
            if (r.status !== client_1.ManagerCashCustodyStatus.VERIFIED) {
                pendingMinor += minor;
            }
            if (r.isOverdue) {
                overdueCount += 1;
                overdueMinor += minor;
                bucket.OVERDUE_24H += 1;
            }
            else if (r.ageHours >= 12) {
                bucket.WARNING_12H += 1;
            }
            else {
                bucket.FRESH += 1;
            }
            if (r.status === client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT) {
                pendingCount += 1;
            }
            else if (r.status === client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION) {
                awaitingCount += 1;
            }
        }
        return {
            pendingCount,
            awaitingVerificationCount: awaitingCount,
            overdueCount,
            totalPendingKd: (0, finance_money_1.minorToAmountString)(pendingMinor),
            totalOverdueKd: (0, finance_money_1.minorToAmountString)(overdueMinor),
            bucket,
        };
    }
};
exports.ManagerCustodyService = ManagerCustodyService;
exports.ManagerCustodyService = ManagerCustodyService = ManagerCustodyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        general_ledger_service_1.GeneralLedgerService])
], ManagerCustodyService);
//# sourceMappingURL=manager-custody.service.js.map