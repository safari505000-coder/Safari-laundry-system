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
var BranchCashLedgerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchCashLedgerService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const money_util_1 = require("../cash-intelligence/engines/money.util");
const HELD_AT_BRANCH_STATUSES = [
    client_1.ManagerCashCustodyStatus.PENDING_DEPOSIT,
    client_1.ManagerCashCustodyStatus.AWAITING_VERIFICATION,
    client_1.ManagerCashCustodyStatus.VERIFIED,
];
let BranchCashLedgerService = BranchCashLedgerService_1 = class BranchCashLedgerService {
    prisma;
    logger = new common_1.Logger(BranchCashLedgerService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async project(opts) {
        const branchFilter = opts?.branchId
            ? { branchId: opts.branchId }
            : {};
        const heldBags = await this.prisma.managerCashCustody.findMany({
            where: {
                ...branchFilter,
                status: { in: HELD_AT_BRANCH_STATUSES },
                bankDepositLog: null,
            },
            select: {
                id: true,
                branchId: true,
                amountKd: true,
            },
        });
        const branchAgg = new Map();
        let unattributedMinor = 0n;
        let unattributedBagCount = 0;
        for (const bag of heldBags) {
            if (!bag.branchId) {
                unattributedMinor += (0, money_util_1.fixed4ToMinor)(bag.amountKd);
                unattributedBagCount += 1;
                continue;
            }
            const prev = branchAgg.get(bag.branchId) ?? {
                minor: 0n,
                bagCount: 0,
            };
            prev.minor += (0, money_util_1.fixed4ToMinor)(bag.amountKd);
            prev.bagCount += 1;
            branchAgg.set(bag.branchId, prev);
        }
        let incomingByBranch = new Map();
        let outgoingByBranch = new Map();
        let unattributedDepositMinor = null;
        const window = opts?.window ?? null;
        if (window) {
            const inBags = await this.prisma.managerCashCustody.findMany({
                where: {
                    ...branchFilter,
                    receivedFromDriverAt: { gte: window.from, lte: window.to },
                    status: { not: client_1.ManagerCashCustodyStatus.REJECTED },
                },
                select: { branchId: true, amountKd: true },
            });
            for (const b of inBags) {
                if (!b.branchId)
                    continue;
                incomingByBranch.set(b.branchId, (incomingByBranch.get(b.branchId) ?? 0n) + (0, money_util_1.fixed4ToMinor)(b.amountKd));
            }
            const depositWhere = {
                status: client_1.BankDepositStatus.VERIFIED,
                verifiedAt: { gte: window.from, lte: window.to },
            };
            if (opts?.branchId) {
                depositWhere.managerCashCustody = { branchId: opts.branchId };
            }
            const outDeposits = await this.prisma.bankDepositLog.findMany({
                where: depositWhere,
                select: {
                    amountKd: true,
                    managerCashCustody: { select: { branchId: true } },
                },
            });
            unattributedDepositMinor = 0n;
            for (const d of outDeposits) {
                const minor = (0, money_util_1.fixed4ToMinor)(d.amountKd);
                const branchId = d.managerCashCustody?.branchId ?? null;
                if (!branchId) {
                    unattributedDepositMinor += minor;
                    continue;
                }
                outgoingByBranch.set(branchId, (outgoingByBranch.get(branchId) ?? 0n) + minor);
            }
        }
        const branchIds = new Set([
            ...branchAgg.keys(),
            ...incomingByBranch.keys(),
            ...outgoingByBranch.keys(),
        ]);
        const nameById = new Map();
        if (branchIds.size > 0) {
            const branches = await this.prisma.branch.findMany({
                where: { id: { in: Array.from(branchIds) } },
                select: { id: true, name: true },
            });
            for (const b of branches)
                nameById.set(b.id, b.name);
        }
        const rows = Array.from(branchIds).map((id) => {
            const held = branchAgg.get(id);
            const name = nameById.get(id) ?? id;
            const currentMinor = held?.minor ?? 0n;
            const bagCount = held?.bagCount ?? 0;
            const incomingMinor = incomingByBranch.get(id);
            const outgoingMinor = outgoingByBranch.get(id);
            return {
                branchId: id,
                branchName: name,
                currentBranchCash: (0, money_util_1.minorToFixed4)(currentMinor),
                openBagCount: bagCount,
                incomingKd: window
                    ? (0, money_util_1.minorToFixed4)(incomingMinor ?? 0n)
                    : null,
                outgoingKd: window
                    ? (0, money_util_1.minorToFixed4)(outgoingMinor ?? 0n)
                    : null,
            };
        });
        rows.sort((a, b) => {
            const aMinor = (0, money_util_1.fixed4ToMinor)(a.currentBranchCash);
            const bMinor = (0, money_util_1.fixed4ToMinor)(b.currentBranchCash);
            if (aMinor !== bMinor)
                return aMinor < bMinor ? 1 : -1;
            return a.branchName.localeCompare(b.branchName);
        });
        const totalCurrentMinor = rows.reduce((s, r) => s + (0, money_util_1.fixed4ToMinor)(r.currentBranchCash), 0n);
        return {
            generatedAt: new Date().toISOString(),
            window: window
                ? {
                    from: window.from.toISOString(),
                    to: window.to.toISOString(),
                }
                : null,
            branches: rows,
            unattributedCustodyKd: (0, money_util_1.minorToFixed4)(unattributedMinor),
            unattributedCustodyBagCount: unattributedBagCount,
            unattributedDepositKd: unattributedDepositMinor !== null
                ? (0, money_util_1.minorToFixed4)(unattributedDepositMinor)
                : null,
            totalCurrentBranchCash: (0, money_util_1.minorToFixed4)(totalCurrentMinor),
            readOnly: true,
            advisoryOnly: true,
        };
    }
};
exports.BranchCashLedgerService = BranchCashLedgerService;
exports.BranchCashLedgerService = BranchCashLedgerService = BranchCashLedgerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BranchCashLedgerService);
//# sourceMappingURL=branch-cash-ledger.service.js.map