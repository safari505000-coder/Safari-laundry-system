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
const audit_logs_service_1 = require("../audit-logs/audit-logs.service");
const cash_service_1 = require("../finance/services/cash.service");
const ledger_projection_service_1 = require("../finance/ledger/ledger-projection.service");
const general_ledger_service_1 = require("../general-ledger/general-ledger.service");
const prisma_service_1 = require("../prisma/prisma.service");
const finance_money_1 = require("../finance/finance-money");
exports.CUSTODY_OVERDUE_MS = 24 * 60 * 60 * 1000;
function riskRank(r) {
    if (r === 'CRITICAL')
        return 2;
    if (r === 'WARNING')
        return 1;
    return 0;
}
function classifyActivity(e) {
    const meta = (e.meta ?? {});
    const source = String(meta.source ?? '');
    const entryType = String(meta.entryType ?? '');
    const event = String(meta.event ?? '');
    if (source === 'GeneralLedgerEntry' && entryType === 'POS_SALE_COMPLETED') {
        return 'POS_SALE';
    }
    if (source === 'BankDepositLog')
        return 'BANK_DEPOSIT';
    if (source === 'ManagerCashCustody') {
        if (event === 'VERIFIED')
            return 'BANK_DEPOSIT';
        return 'DRIVER_HANDOVER';
    }
    return 'OTHER';
}
let ManagerCustodyService = ManagerCustodyService_1 = class ManagerCustodyService {
    prisma;
    generalLedger;
    cashService;
    auditLogs;
    ledgerProjection;
    logger = new common_1.Logger(ManagerCustodyService_1.name);
    constructor(prisma, generalLedger, cashService, auditLogs, ledgerProjection) {
        this.prisma = prisma;
        this.generalLedger = generalLedger;
        this.cashService = cashService;
        this.auditLogs = auditLogs;
        this.ledgerProjection = ledgerProjection;
    }
    async approveReceiptFromDriver(managerId, _managerBranchId, dto) {
        const result = await this.cashService.confirmHandover(managerId, client_1.SafariRole.MANAGER, {
            driverId: dto.driverId,
            declaredHandoverTotal: dto.declaredHandoverTotal,
        });
        if (result.settledOrderCount === 0) {
            throw new common_1.BadRequestException('No cash pending settlement for this driver.');
        }
        const bag = await this.prisma.managerCashCustody.findFirst({
            where: {
                managerId,
                driverId: dto.driverId,
                status: client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
            },
            orderBy: { createdAt: 'desc' },
            include: {
                manager: {
                    select: { id: true, fullName: true, username: true, phone: true },
                },
                driver: { select: { id: true, fullName: true, username: true } },
                branch: { select: { id: true, name: true } },
                shift: { select: { id: true, endedAt: true, startedAt: true } },
            },
        });
        if (!bag) {
            throw new common_1.ConflictException('Handover completed but custody bag was not found. Retry.');
        }
        const note = dto.note?.trim() ?? '';
        if (note.length > 0 && bag.note !== note) {
            const updated = await this.prisma.managerCashCustody.update({
                where: { id: bag.id },
                data: { note },
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
        return this.toRow(bag);
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
            if (row.depositSlipUrl) {
                const existingDeposit = await tx.bankDepositLog.findFirst({
                    where: {
                        OR: [
                            { managerCashCustodyId: row.id },
                            {
                                shiftId: row.shiftId,
                                receiptImageUrl: row.depositSlipUrl,
                                amountKd: row.amountKd,
                            },
                        ],
                    },
                });
                if (!existingDeposit) {
                    const deposit = await tx.bankDepositLog.create({
                        data: {
                            depositType: client_1.BankDepositType.CASH_DEPOSIT_SLIP,
                            status: client_1.BankDepositStatus.VERIFIED,
                            amountKd: row.amountKd,
                            receiptImageUrl: row.depositSlipUrl,
                            shiftId: row.shiftId,
                            managerCashCustodyId: row.id,
                            uploadedById: row.managerId,
                            verifiedByAccountantId: accountantId,
                            verifiedAt: row.verifiedAt,
                            createdAt: row.slipUploadedAt ?? row.receivedFromDriverAt,
                        },
                    });
                    await tx.auditLog.create({
                        data: {
                            userId: accountantId,
                            actorId: accountantId,
                            action: 'CASH_DEPOSIT_REGISTERED',
                            resource: 'bank_deposit_log',
                            amount: row.amountKd,
                            source: 'MANAGER_CASH_CUSTODY',
                            status: client_1.AuditStatus.SUCCESS,
                            changes: {
                                managerCashCustodyId: row.id,
                                bankDepositLogId: deposit.id,
                                shiftId: row.shiftId,
                                amountKd: row.amountKd.toString(),
                            },
                        },
                    });
                }
                else if (!existingDeposit.managerCashCustodyId) {
                    await tx.bankDepositLog.update({
                        where: { id: existingDeposit.id },
                        data: {
                            managerCashCustodyId: row.id,
                            status: existingDeposit.verifiedAt ?
                                client_1.BankDepositStatus.VERIFIED
                                : existingDeposit.status,
                        },
                    });
                }
            }
            return row;
        });
        this.auditLogs.logFinancialEvent({
            action: 'CASH_DEPOSIT_VERIFIED',
            userId: accountantId,
            role: client_1.SafariRole.ACCOUNTANT,
            amount: updated.amountKd.toString(),
            source: 'MANAGER_CASH_CUSTODY',
            changes: {
                custodyId: updated.id,
                managerId: updated.managerId,
                driverId: updated.driverId,
                branchId: updated.branchId,
                shiftId: updated.shiftId,
                settledOrderCount: updated.settledOrderCount,
            },
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
        this.auditLogs.logFinancialEvent({
            action: 'CASH_HANDOVER_REJECTED',
            userId: accountantId,
            role: client_1.SafariRole.ACCOUNTANT,
            amount: updated.amountKd.toString(),
            source: 'MANAGER_CASH_CUSTODY',
            changes: {
                custodyId: updated.id,
                managerId: updated.managerId,
                driverId: updated.driverId,
                branchId: updated.branchId,
                shiftId: updated.shiftId,
                rejectionReason: updated.rejectionReason,
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
    async listMineForActor(userId, role) {
        if (role === client_1.SafariRole.MANAGER) {
            return this.listMine(userId);
        }
        if (role === client_1.SafariRole.OWNER ||
            role === client_1.SafariRole.GENERAL_MANAGER ||
            role === client_1.SafariRole.ACCOUNTANT) {
            const { rows } = await this.listAging({});
            return rows;
        }
        throw new common_1.ForbiddenException('Not authorised for manager custody list.');
    }
    async listByDriver(driverId) {
        const rows = await this.prisma.managerCashCustody.findMany({
            where: { driverId },
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
    async findByIdForReceipt(custodyId, actorUserId, actorRole) {
        const bag = await this.prisma.managerCashCustody.findUnique({
            where: { id: custodyId },
            include: {
                manager: {
                    select: { id: true, fullName: true, username: true, phone: true },
                },
                driver: { select: { id: true, fullName: true, username: true } },
                branch: { select: { id: true, name: true } },
                shift: { select: { id: true, endedAt: true, startedAt: true } },
            },
        });
        if (!bag)
            throw new common_1.NotFoundException('Custody bag not found.');
        const privileged = [
            client_1.SafariRole.OWNER,
            client_1.SafariRole.GENERAL_MANAGER,
            client_1.SafariRole.ACCOUNTANT,
        ];
        const isPrivileged = privileged.includes(actorRole);
        const isDriver = bag.driverId === actorUserId;
        const isManager = bag.managerId === actorUserId;
        if (!isPrivileged && !isDriver && !isManager) {
            throw new common_1.ForbiddenException('You are not authorised to read this cash-handover receipt.');
        }
        return this.toRow(bag);
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
    async getCashStatusSnapshot(managerId) {
        const to = new Date();
        const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
        const [managerRow, bagsAgg, custodyAgg, entries, allDrivers] = await Promise.all([
            this.prisma.user.findUnique({
                where: { id: managerId },
                select: { id: true, fullName: true, branchId: true },
            }),
            this.prisma.managerCashCustody.aggregate({
                where: {
                    managerId,
                    status: {
                        in: [
                            client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
                            client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION,
                        ],
                    },
                },
                _count: { _all: true },
                _max: { receivedFromDriverAt: true },
            }),
            this.prisma.managerCashCustody.aggregate({
                where: {
                    managerId,
                    status: {
                        in: [
                            client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
                            client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION,
                        ],
                    },
                },
                _sum: { amountKd: true },
            }),
            this.ledgerProjection.project({
                fromIso: from.toISOString(),
                toIso: to.toISOString(),
            }),
            this.cashService.getDriverBalances(),
        ]);
        const managerAccountId = `MANAGER_${managerId}`;
        const managerAccount = this.ledgerProjection.aggregateAccounts(entries.filter((e) => e.accountId === managerAccountId))[0];
        const pendingDepositKd = managerAccount?.balance ?? '0.0000';
        const custodyBagsTotalKd = custodyAgg._sum.amountKd
            ? new client_1.Prisma.Decimal(custodyAgg._sum.amountKd.toString()).toFixed(4)
            : '0.0000';
        const managerOwnPosKd = new client_1.Prisma.Decimal(pendingDepositKd)
            .minus(new client_1.Prisma.Decimal(custodyBagsTotalKd))
            .toFixed(4);
        const branchDrivers = managerRow?.branchId
            ? allDrivers.drivers.filter((d) => d.branchId === managerRow.branchId)
            : allDrivers.drivers;
        const driversAtRisk = branchDrivers
            .filter((d) => new client_1.Prisma.Decimal(d.heldCashTotal).greaterThan(0))
            .map((d) => {
            const ageMs = d.shiftStartedAt
                ? Date.now() - new Date(d.shiftStartedAt).getTime()
                : null;
            const ageHours = ageMs !== null ? Math.floor(ageMs / 3_600_000) : null;
            let riskLevel = 'NORMAL';
            if (ageHours !== null && ageHours >= 48)
                riskLevel = 'CRITICAL';
            else if (ageHours !== null && ageHours >= 24)
                riskLevel = 'WARNING';
            return {
                driverId: d.driverId,
                driverName: d.fullName,
                driverUsername: d.username,
                driverPhone: d.phone,
                heldCashKd: d.heldCashTotal,
                pendingOrderCount: d.pendingSettlementOrderCount,
                shiftStartedAt: d.shiftStartedAt
                    ? new Date(d.shiftStartedAt).toISOString()
                    : null,
                ageHours,
                riskLevel,
            };
        })
            .sort((a, b) => {
            const r = riskRank(b.riskLevel) - riskRank(a.riskLevel);
            if (r !== 0)
                return r;
            return new client_1.Prisma.Decimal(b.heldCashKd).comparedTo(new client_1.Prisma.Decimal(a.heldCashKd));
        });
        const driversAwaitingHandoverKd = driversAtRisk
            .reduce((acc, d) => acc.plus(new client_1.Prisma.Decimal(d.heldCashKd)), new client_1.Prisma.Decimal(0))
            .toFixed(4);
        const branchDriverIds = new Set(branchDrivers.map((d) => d.driverId));
        const branchDriverAccounts = new Set([...branchDriverIds].map((id) => `DRIVER_${id}`));
        const relevantEntries = entries.filter((e) => e.accountId === managerAccountId ||
            branchDriverAccounts.has(e.accountId));
        const seenTx = new Set();
        const deduped = relevantEntries
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
            .filter((e) => {
            if (seenTx.has(e.txId))
                return false;
            seenTx.add(e.txId);
            return true;
        });
        const recentActivity = deduped.slice(0, 10).map((e) => ({
            txId: e.txId,
            at: e.createdAt,
            amountKd: new client_1.Prisma.Decimal((e.debit !== '0.0000' ? e.debit : e.credit) || '0').toFixed(4),
            kind: classifyActivity({
                meta: e.meta,
                accountId: e.accountId,
            }),
            actorAccountId: e.accountId,
            meta: e.meta,
        }));
        const lastActivityAt = recentActivity[0]?.at ?? null;
        return {
            source: 'api/manager/cash-status',
            managerId,
            managerName: managerRow?.fullName ?? '',
            pendingDepositKd,
            managerOwnPosKd,
            custodyBagsTotalKd,
            driversAwaitingHandoverKd,
            bagsCount: bagsAgg._count._all,
            driversAtRiskCount: driversAtRisk.length,
            lastHandoverAt: bagsAgg._max.receivedFromDriverAt?.toISOString() ?? null,
            lastActivityAt,
            drivers: driversAtRisk,
            recentActivity,
            generatedAt: new Date().toISOString(),
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
        general_ledger_service_1.GeneralLedgerService,
        cash_service_1.CashService,
        audit_logs_service_1.AuditLogsService,
        ledger_projection_service_1.LedgerProjectionService])
], ManagerCustodyService);
//# sourceMappingURL=manager-custody.service.js.map