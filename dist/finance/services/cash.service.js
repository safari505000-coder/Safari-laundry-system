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
exports.CashService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
const audit_logs_service_1 = require("../../audit-logs/audit-logs.service");
const institutional_mutation_util_1 = require("../../auth/institutional-mutation.util");
const finance_money_1 = require("../finance-money");
function sumKd(values) {
    let total = 0;
    for (const v of values) {
        const n = Number(v);
        if (Number.isFinite(n))
            total += n;
    }
    return total.toFixed(4);
}
function zeroKpis() {
    return {
        totalCollectedKd: '0.0000',
        totalHandedToManagerKd: '0.0000',
        totalAtBankKd: '0.0000',
        totalPendingWithDriverKd: '0.0000',
        totalPendingAtManagerKd: '0.0000',
        totalAwaitingVerificationKd: '0.0000',
        totalRejectedKd: '0.0000',
        totalCollectedOrderCount: 0,
        totalBagCount: 0,
    };
}
function parseLatLng(input) {
    if (!input)
        return null;
    const parts = input.split(',').map((x) => Number.parseFloat(x.trim()));
    if (parts.length !== 2)
        return null;
    const [lat, lng] = parts;
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
        return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
        return null;
    return { lat, lng };
}
let CashService = class CashService {
    prisma;
    auditLogs;
    constructor(prisma, auditLogs) {
        this.prisma = prisma;
        this.auditLogs = auditLogs;
    }
    async ensureOpenShiftForDriver(driverId) {
        const user = await this.prisma.user.findUnique({ where: { id: driverId } });
        if (!user || user.safariRole !== client_1.SafariRole.DRIVER)
            return;
        const open = await this.prisma.shift.findFirst({
            where: { driverId, status: client_1.ShiftStatus.OPEN },
            orderBy: { startedAt: 'desc' },
        });
        if (open)
            return;
        await this.prisma.shift.create({
            data: { driverId, status: client_1.ShiftStatus.OPEN },
        });
    }
    async getDailyPosSalesByPaymentMethod(fromIso, toIso, scopedDriverId) {
        const from = new Date(fromIso);
        const to = new Date(toIso);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new common_1.BadRequestException('Invalid date range');
        }
        const rows = await this.prisma.order.groupBy({
            by: ['posPaymentMethod'],
            where: {
                status: client_1.OrderStatus.COMPLETED,
                completedAt: { gte: from, lte: to },
                ...(scopedDriverId ? { driverId: scopedDriverId } : {}),
            },
            _sum: { totalPrice: true },
            _count: true,
        });
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            rows: rows.map((r) => ({
                posPaymentMethod: r.posPaymentMethod,
                orderCount: r._count,
                totalRevenue: r._sum?.totalPrice !== null && r._sum?.totalPrice !== undefined
                    ? r._sum.totalPrice.toString()
                    : '0',
            })),
        };
    }
    async getDriverBalances() {
        const drivers = await this.prisma.user.findMany({
            where: { safariRole: client_1.SafariRole.DRIVER },
            select: {
                id: true,
                username: true,
                fullName: true,
                employeeId: true,
                phone: true,
                branchId: true,
            },
            orderBy: { username: 'asc' },
        });
        const rows = [];
        for (const d of drivers) {
            const shift = await this.prisma.shift.findFirst({
                where: { driverId: d.id, status: client_1.ShiftStatus.OPEN },
                orderBy: { startedAt: 'desc' },
            });
            const pendingAll = await this.prisma.order.findMany({
                where: {
                    driverId: d.id,
                    status: client_1.OrderStatus.COMPLETED,
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                },
                select: { totalPrice: true, posPaymentMethod: true },
            });
            const buckets = {
                cash: [],
                knet: [],
                link: [],
                online: [],
            };
            for (const o of pendingAll) {
                switch (o.posPaymentMethod) {
                    case client_1.PosPaymentMethod.CASH:
                        buckets.cash.push({ totalPrice: o.totalPrice });
                        break;
                    case client_1.PosPaymentMethod.KNET:
                        buckets.knet.push({ totalPrice: o.totalPrice });
                        break;
                    case client_1.PosPaymentMethod.PAYMENT_LINK:
                        buckets.link.push({ totalPrice: o.totalPrice });
                        break;
                    case client_1.PosPaymentMethod.ONLINE:
                        buckets.online.push({ totalPrice: o.totalPrice });
                        break;
                    default:
                        break;
                }
            }
            const cashMinor = (0, finance_money_1.sumOrderMinors)(buckets.cash);
            const knetMinor = (0, finance_money_1.sumOrderMinors)(buckets.knet);
            const linkMinor = (0, finance_money_1.sumOrderMinors)(buckets.link);
            const onlineMinor = (0, finance_money_1.sumOrderMinors)(buckets.online);
            const totalMinor = cashMinor + knetMinor + linkMinor + onlineMinor;
            rows.push({
                driverId: d.id,
                employeeId: d.employeeId,
                username: d.username,
                fullName: d.fullName,
                phone: d.phone,
                branchId: d.branchId,
                currentShiftId: shift?.id ?? null,
                shiftStartedAt: shift?.startedAt ?? null,
                heldCashTotal: (0, finance_money_1.minorToAmountString)(cashMinor),
                pendingSettlementOrderCount: buckets.cash.length,
                pendingCashKd: (0, finance_money_1.minorToAmountString)(cashMinor),
                pendingKnetKd: (0, finance_money_1.minorToAmountString)(knetMinor),
                pendingLinkKd: (0, finance_money_1.minorToAmountString)(linkMinor),
                pendingOnlineKd: (0, finance_money_1.minorToAmountString)(onlineMinor),
                pendingTotalKd: (0, finance_money_1.minorToAmountString)(totalMinor),
                pendingInvoiceCount: buckets.cash.length +
                    buckets.knet.length +
                    buckets.link.length +
                    buckets.online.length,
            });
        }
        return { drivers: rows };
    }
    async getTotalCashWithDrivers() {
        const rows = await this.prisma.order.findMany({
            where: {
                status: client_1.OrderStatus.COMPLETED,
                cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                posPaymentMethod: client_1.PosPaymentMethod.CASH,
            },
            select: { totalPrice: true },
        });
        return (0, finance_money_1.minorToAmountString)((0, finance_money_1.sumOrderMinors)(rows));
    }
    async getDriverMonitoring(branchId = null) {
        const activeDrivers = await this.prisma.user.findMany({
            where: {
                safariRole: client_1.SafariRole.DRIVER,
                shiftsAsDriver: { some: { status: client_1.ShiftStatus.OPEN } },
                ...(branchId ? { branchId } : {}),
            },
            orderBy: { fullName: 'asc' },
            select: {
                id: true,
                fullName: true,
                username: true,
                phone: true,
                vehicleLabel: true,
                lastKnownLocation: true,
                branch: { select: { id: true, name: true, location: true } },
            },
        });
        return {
            drivers: activeDrivers.map((d) => {
                const live = parseLatLng(d.lastKnownLocation);
                const fallback = parseLatLng(d.branch?.location ?? null);
                const location = live ?? fallback;
                return {
                    driverId: d.id,
                    fullName: d.fullName,
                    username: d.username,
                    phone: d.phone,
                    vehicleLabel: d.vehicleLabel ?? 'Toyota LC300',
                    status: 'ON_SHIFT',
                    source: live ? 'LIVE_GPS' : 'BRANCH_FALLBACK',
                    lastKnownLocation: live,
                    markerLocation: location,
                    branch: d.branch,
                };
            }),
        };
    }
    async updateDriverTracking(driverId, dto) {
        const driver = await this.prisma.user.findUnique({
            where: { id: driverId },
            select: { id: true, safariRole: true },
        });
        if (!driver || driver.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.NotFoundException('Driver not found');
        }
        if (dto.lastKnownLocation !== undefined &&
            dto.lastKnownLocation.trim().length > 0 &&
            !parseLatLng(dto.lastKnownLocation)) {
            throw new common_1.BadRequestException('lastKnownLocation must be "lat,lng"');
        }
        return this.prisma.user.update({
            where: { id: driverId },
            data: {
                ...(dto.vehicleLabel !== undefined
                    ? { vehicleLabel: dto.vehicleLabel.trim() || null }
                    : {}),
                ...(dto.lastKnownLocation !== undefined
                    ? { lastKnownLocation: dto.lastKnownLocation.trim() || null }
                    : {}),
            },
            select: {
                id: true,
                fullName: true,
                username: true,
                vehicleLabel: true,
                lastKnownLocation: true,
            },
        });
    }
    async confirmHandover(managerId, actorRole, dto) {
        (0, institutional_mutation_util_1.assertInstitutionalMutationAllowed)(actorRole);
        const driver = await this.prisma.user.findUnique({
            where: { id: dto.driverId },
        });
        if (!driver || driver.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.NotFoundException('Driver not found');
        }
        const result = await this.prisma.$transaction(async (tx) => {
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
            const shift = await tx.shift.findFirst({
                where: { driverId: dto.driverId, status: client_1.ShiftStatus.OPEN },
                orderBy: { startedAt: 'desc' },
            });
            if (pending.length === 0) {
                return {
                    settledOrderCount: 0,
                    systemHandoverTotal: '0.0000',
                    shiftId: shift?.id ?? null,
                    bankDepositReceiptUrl: dto.depositReceiptUrl ?? null,
                    custodyBagId: null,
                    branchId: null,
                };
            }
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
            const systemHandoverTotal = (0, finance_money_1.minorToAmountString)(systemMinor);
            const manager = await tx.user.findUnique({
                where: { id: managerId },
                select: { branchId: true },
            });
            const hasSlip = Boolean(dto.depositReceiptUrl);
            const branchId = manager?.branchId ?? driver.branchId ?? null;
            const bag = await tx.managerCashCustody.create({
                data: {
                    managerId,
                    driverId: dto.driverId,
                    branchId,
                    shiftId: shift?.id ?? null,
                    amountKd: systemHandoverTotal,
                    settledOrderCount: pending.length,
                    status: hasSlip
                        ? client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION
                        : client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
                    depositSlipUrl: dto.depositReceiptUrl ?? null,
                    slipUploadedAt: hasSlip ? new Date() : null,
                },
                select: { id: true },
            });
            return {
                settledOrderCount: pending.length,
                systemHandoverTotal,
                shiftId: shift?.id ?? null,
                bankDepositReceiptUrl: dto.depositReceiptUrl ?? null,
                custodyBagId: bag.id,
                branchId,
            };
        });
        if (result.settledOrderCount > 0) {
            this.auditLogs.logFinancialEvent({
                action: 'CASH_HANDOVER_TRANSFER',
                userId: managerId,
                role: actorRole,
                amount: result.systemHandoverTotal,
                source: 'DRIVER_TO_BRANCH_HANDOVER',
                changes: {
                    driverId: dto.driverId,
                    branchId: result.branchId,
                    custodyBagId: result.custodyBagId,
                    shiftId: result.shiftId,
                    settledOrderCount: result.settledOrderCount,
                    declaredHandoverTotal: dto.declaredHandoverTotal ?? null,
                    depositReceiptProvided: Boolean(dto.depositReceiptUrl),
                },
            });
        }
        return {
            settledOrderCount: result.settledOrderCount,
            systemHandoverTotal: result.systemHandoverTotal,
            shiftId: result.shiftId,
            bankDepositReceiptUrl: result.bankDepositReceiptUrl,
        };
    }
    async getDriverCashTrace(query) {
        const from = new Date(query.from);
        const to = new Date(query.to);
        const driversRaw = await this.prisma.user.findMany({
            where: {
                safariRole: client_1.SafariRole.DRIVER,
                ...(query.driverId ? { id: query.driverId } : {}),
                ...(query.branchId ? { branchId: query.branchId } : {}),
            },
            select: {
                id: true,
                username: true,
                fullName: true,
                branchId: true,
                branch: { select: { id: true, name: true } },
            },
            orderBy: { fullName: 'asc' },
        });
        if (driversRaw.length === 0) {
            return {
                range: { from: from.toISOString(), to: to.toISOString() },
                kpis: zeroKpis(),
                drivers: [],
            };
        }
        const driverIds = driversRaw.map((d) => d.id);
        const collectedAgg = await this.prisma.order.groupBy({
            by: ['driverId'],
            where: {
                driverId: { in: driverIds },
                posPaymentMethod: client_1.PosPaymentMethod.CASH,
                status: client_1.OrderStatus.COMPLETED,
                completedAt: { gte: from, lte: to },
            },
            _sum: { totalPrice: true },
            _count: { _all: true },
        });
        const collectedByDriver = new Map();
        for (const row of collectedAgg) {
            if (!row.driverId)
                continue;
            collectedByDriver.set(row.driverId, {
                kd: row._sum.totalPrice?.toString() ?? '0',
                count: row._count._all,
            });
        }
        const bags = await this.prisma.managerCashCustody.findMany({
            where: {
                driverId: { in: driverIds },
                receivedFromDriverAt: { gte: from, lte: to },
                ...(query.branchId ? { branchId: query.branchId } : {}),
            },
            select: {
                id: true,
                driverId: true,
                managerId: true,
                branchId: true,
                amountKd: true,
                settledOrderCount: true,
                status: true,
                receivedFromDriverAt: true,
                slipUploadedAt: true,
                verifiedAt: true,
                rejectedAt: true,
                rejectionReason: true,
                manager: { select: { id: true, username: true, fullName: true } },
                branch: { select: { id: true, name: true } },
            },
            orderBy: { receivedFromDriverAt: 'asc' },
        });
        const bagsByDriver = new Map();
        for (const bag of bags) {
            const list = bagsByDriver.get(bag.driverId) ?? [];
            list.push({
                id: bag.id,
                amountKd: bag.amountKd.toString(),
                settledOrderCount: bag.settledOrderCount,
                status: bag.status,
                managerId: bag.manager?.id ?? null,
                managerName: bag.manager?.fullName ?? null,
                managerUsername: bag.manager?.username ?? null,
                branchId: bag.branch?.id ?? null,
                branchName: bag.branch?.name ?? null,
                receivedFromDriverAt: bag.receivedFromDriverAt.toISOString(),
                slipUploadedAt: bag.slipUploadedAt?.toISOString() ?? null,
                verifiedAt: bag.verifiedAt?.toISOString() ?? null,
                rejectedAt: bag.rejectedAt?.toISOString() ?? null,
                rejectionReason: bag.rejectionReason ?? null,
            });
            bagsByDriver.set(bag.driverId, list);
        }
        const drivers = driversRaw.map((d) => {
            const collected = collectedByDriver.get(d.id) ?? { kd: '0', count: 0 };
            const list = bagsByDriver.get(d.id) ?? [];
            const handedToManagerKd = sumKd(list.map((b) => b.amountKd));
            const atBankKd = sumKd(list.filter((b) => b.status === 'VERIFIED').map((b) => b.amountKd));
            const pendingAtManagerKd = sumKd(list
                .filter((b) => b.status === 'PENDING_DEPOSIT')
                .map((b) => b.amountKd));
            const awaitingVerificationKd = sumKd(list
                .filter((b) => b.status === 'AWAITING_VERIFICATION')
                .map((b) => b.amountKd));
            const rejectedKd = sumKd(list.filter((b) => b.status === 'REJECTED').map((b) => b.amountKd));
            const diff = Number(collected.kd) - Number(handedToManagerKd);
            const pendingWithDriverKd = diff > 0 ? diff.toFixed(4) : '0.0000';
            return {
                driverId: d.id,
                username: d.username,
                fullName: d.fullName,
                branchId: d.branch?.id ?? null,
                branchName: d.branch?.name ?? null,
                collectedKd: collected.kd,
                collectedOrderCount: collected.count,
                handedToManagerKd,
                handedToManagerBagCount: list.length,
                pendingWithDriverKd,
                atBankKd,
                pendingAtManagerKd,
                awaitingVerificationKd,
                rejectedKd,
                bags: list,
            };
        });
        const active = drivers.filter((d) => Number(d.collectedKd) > 0 ||
            d.bags.length > 0 ||
            d.collectedOrderCount > 0);
        const kpis = {
            totalCollectedKd: sumKd(active.map((d) => d.collectedKd)),
            totalHandedToManagerKd: sumKd(active.map((d) => d.handedToManagerKd)),
            totalAtBankKd: sumKd(active.map((d) => d.atBankKd)),
            totalPendingWithDriverKd: sumKd(active.map((d) => d.pendingWithDriverKd)),
            totalPendingAtManagerKd: sumKd(active.map((d) => d.pendingAtManagerKd)),
            totalAwaitingVerificationKd: sumKd(active.map((d) => d.awaitingVerificationKd)),
            totalRejectedKd: sumKd(active.map((d) => d.rejectedKd)),
            totalCollectedOrderCount: active.reduce((n, d) => n + d.collectedOrderCount, 0),
            totalBagCount: active.reduce((n, d) => n + d.bags.length, 0),
        };
        return {
            range: { from: from.toISOString(), to: to.toISOString() },
            kpis,
            drivers: active,
        };
    }
    async getCashReconciliationSnapshot(query) {
        const trace = await this.getDriverCashTrace(query);
        const [pendingDriversKd, depRejected, awaiting] = await Promise.all([
            this.getTotalCashWithDrivers(),
            this.prisma.managerCashCustody.aggregate({
                where: {
                    status: {
                        in: [
                            client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
                            client_1.ManagerCashCustodyStatus.REJECTED,
                        ],
                    },
                },
                _sum: { amountKd: true },
                _count: { _all: true },
            }),
            this.prisma.managerCashCustody.aggregate({
                where: { status: client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION },
                _sum: { amountKd: true },
                _count: { _all: true },
            }),
        ]);
        const depRejectedKd = depRejected._sum.amountKd !== null && depRejected._sum.amountKd !== undefined
            ? depRejected._sum.amountKd.toFixed(4)
            : '0.0000';
        const awaitingKd = awaiting._sum.amountKd !== null && awaiting._sum.amountKd !== undefined
            ? awaiting._sum.amountKd.toFixed(4)
            : '0.0000';
        return {
            range: trace.range,
            notes: [
                'eventBasedInRange uses completedAt (collected) and receivedFromDriverAt (handed) inside [from, to].',
                'stateBasedNow.pendingWithDriversKd is current driver field cash (PAID_TO_DRIVER), not window-scoped.',
                'stateBasedNow.pendingWithManagers* uses open custody rows by status (deposit/rejected vs awaiting verification).',
            ],
            eventBasedInRange: {
                collectedKd: trace.kpis.totalCollectedKd,
                handedToManagerKd: trace.kpis.totalHandedToManagerKd,
                collectedOrderCount: trace.kpis.totalCollectedOrderCount,
                handedBagCount: trace.kpis.totalBagCount,
            },
            stateBasedNow: {
                pendingWithDriversKd: pendingDriversKd,
                pendingWithManagersDepositOrRejectedKd: depRejectedKd,
                pendingWithManagersDepositOrRejectedBagCount: depRejected._count._all,
                awaitingVerificationKd: awaitingKd,
                awaitingVerificationBagCount: awaiting._count._all,
            },
            driverCashTraceKpis: trace.kpis,
        };
    }
    async getOwnerFinancialCycleReport() {
        const rows = await this.prisma.order.findMany({
            where: {
                posPaymentMethod: client_1.PosPaymentMethod.CASH,
                handoverShiftId: { not: null },
            },
            orderBy: { updatedAt: 'desc' },
            take: 1000,
            select: {
                id: true,
                totalPrice: true,
                updatedAt: true,
                handoverShift: {
                    select: {
                        id: true,
                        confirmedAt: true,
                        confirmedByManager: {
                            select: { id: true, fullName: true, username: true },
                        },
                        managerCustodyBags: {
                            orderBy: { receivedFromDriverAt: 'desc' },
                            take: 1,
                            select: {
                                receivedFromDriverAt: true,
                                manager: {
                                    select: { id: true, fullName: true, username: true },
                                },
                            },
                        },
                        bankDepositLogs: {
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                            select: {
                                id: true,
                                receiptImageUrl: true,
                                verifiedAt: true,
                                verifiedByAccountant: {
                                    select: { id: true, fullName: true, username: true },
                                },
                            },
                        },
                    },
                },
            },
        });
        return {
            rows: rows.map((o) => {
                const shift = o.handoverShift;
                const bag = shift?.managerCustodyBags[0] ?? null;
                const deposit = shift?.bankDepositLogs[0] ?? null;
                return {
                    orderId: o.id,
                    amountKd: o.totalPrice.toString(),
                    collectedAt: bag?.receivedFromDriverAt?.toISOString() ??
                        shift?.confirmedAt?.toISOString() ??
                        null,
                    collectedByManager: bag?.manager ?? shift?.confirmedByManager ?? null,
                    depositLogId: deposit?.id ?? null,
                    receiptImageUrl: deposit?.receiptImageUrl ?? null,
                    verifiedAt: deposit?.verifiedAt?.toISOString() ?? null,
                    verifiedByAccountant: deposit?.verifiedByAccountant ?? null,
                    lastUpdatedAt: o.updatedAt.toISOString(),
                };
            }),
        };
    }
};
exports.CashService = CashService;
exports.CashService = CashService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_logs_service_1.AuditLogsService])
], CashService);
//# sourceMappingURL=cash.service.js.map