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
exports.SafariStreamService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const laundry_price_list_service_1 = require("../laundry-price-list/laundry-price-list.service");
const manager_custody_service_1 = require("../manager-custody/manager-custody.service");
const permissions_service_1 = require("../permissions/permissions.service");
const prisma_service_1 = require("../prisma/prisma.service");
const reports_service_1 = require("../reports/reports.service");
const operating_hours_service_1 = require("../system/operating-hours.service");
let SafariStreamService = class SafariStreamService {
    prisma;
    permissionsService;
    operatingHours;
    reportsService;
    laundryPriceListService;
    managerCustodyService;
    constructor(prisma, permissionsService, operatingHours, reportsService, laundryPriceListService, managerCustodyService) {
        this.prisma = prisma;
        this.permissionsService = permissionsService;
        this.operatingHours = operatingHours;
        this.reportsService = reportsService;
        this.laundryPriceListService = laundryPriceListService;
        this.managerCustodyService = managerCustodyService;
    }
    async buildInstitutionRadar() {
        const status = this.operatingHours.getStatusPayload();
        const fin = status.financialDateIso;
        const fromKuwait = new Date(`${fin}T00:00:00+03:00`);
        const toKuwait = new Date(`${fin}T23:59:59.999+03:00`);
        const [cashGroups, expGroups, depGroups, pendingAll, exec] = await Promise.all([
            this.prisma.order.groupBy({
                by: ['driverId'],
                where: {
                    status: client_1.OrderStatus.COMPLETED,
                    cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                    posPaymentMethod: client_1.PosPaymentMethod.CASH,
                    driverId: { not: null },
                },
                _sum: { totalPrice: true },
            }),
            this.prisma.branchExpense.groupBy({
                by: ['recordedById'],
                where: {
                    status: { in: [client_1.ExpenseStatus.APPROVED, client_1.ExpenseStatus.AUDIT] },
                    recordedBy: { safariRole: client_1.SafariRole.DRIVER },
                },
                _sum: { amount: true },
            }),
            this.prisma.deposit.groupBy({
                by: ['driverId'],
                where: { status: client_1.DepositStatus.PENDING },
                _sum: { amount: true },
            }),
            this.prisma.deposit.aggregate({
                where: { status: client_1.DepositStatus.PENDING },
                _sum: { amount: true },
            }),
            this.reportsService.netProfitExecutive(fromKuwait.toISOString(), toKuwait.toISOString(), undefined, undefined),
        ]);
        const cashByDriver = new Map();
        for (const g of cashGroups) {
            if (g.driverId) {
                cashByDriver.set(g.driverId, new client_1.Prisma.Decimal(g._sum.totalPrice?.toString() ?? '0'));
            }
        }
        const expByDriver = new Map();
        for (const g of expGroups) {
            expByDriver.set(g.recordedById, new client_1.Prisma.Decimal(g._sum.amount?.toString() ?? '0'));
        }
        const depByDriver = new Map();
        for (const g of depGroups) {
            depByDriver.set(g.driverId, new client_1.Prisma.Decimal(g._sum.amount?.toString() ?? '0'));
        }
        const ids = new Set();
        for (const k of cashByDriver.keys())
            ids.add(k);
        for (const k of expByDriver.keys())
            ids.add(k);
        for (const k of depByDriver.keys())
            ids.add(k);
        let fieldTotal = new client_1.Prisma.Decimal(0);
        for (const id of ids) {
            const c = cashByDriver.get(id) ?? new client_1.Prisma.Decimal(0);
            const e = expByDriver.get(id) ?? new client_1.Prisma.Decimal(0);
            const p = depByDriver.get(id) ?? new client_1.Prisma.Decimal(0);
            fieldTotal = fieldTotal.add(c.sub(e).sub(p));
        }
        const pend = new client_1.Prisma.Decimal(pendingAll._sum.amount?.toString() ?? '0');
        return {
            allDriversFieldCashKd: fieldTotal.toFixed(4),
            allDriversPendingDepositsKd: pend.toFixed(4),
            financialDayNetProfitKd: exec.netProfitKd,
            financialDateIso: fin,
        };
    }
    async buildSnapshot(userId, jwtRole) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                fullName: true,
                phone: true,
                safariRole: true,
                branchId: true,
            },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        const permissionKeys = await this.permissionsService.listPermissionKeysForRoleName(jwtRole);
        let fieldCashAvailableKd = null;
        let pendingDepositHoldKd = null;
        let pendingDebtOrdersKd = null;
        if (user.safariRole === client_1.SafariRole.DRIVER) {
            const [cashSum, expSum, depSum, debtSum] = await Promise.all([
                this.prisma.order.aggregate({
                    where: {
                        driverId: userId,
                        status: client_1.OrderStatus.COMPLETED,
                        cashStatus: client_1.CashStatus.PAID_TO_DRIVER,
                        posPaymentMethod: client_1.PosPaymentMethod.CASH,
                    },
                    _sum: { totalPrice: true },
                }),
                this.prisma.branchExpense.aggregate({
                    where: {
                        recordedById: userId,
                        status: { in: [client_1.ExpenseStatus.APPROVED, client_1.ExpenseStatus.AUDIT] },
                    },
                    _sum: { amount: true },
                }),
                this.prisma.deposit.aggregate({
                    where: { driverId: userId, status: client_1.DepositStatus.PENDING },
                    _sum: { amount: true },
                }),
                this.prisma.order.aggregate({
                    where: {
                        driverId: userId,
                        status: client_1.OrderStatus.COMPLETED,
                        posPaymentMethod: client_1.PosPaymentMethod.DEBT_ON_ACCOUNT,
                    },
                    _sum: { totalPrice: true },
                }),
            ]);
            const cash = new client_1.Prisma.Decimal(cashSum._sum.totalPrice?.toString() ?? '0');
            const exp = new client_1.Prisma.Decimal(expSum._sum.amount?.toString() ?? '0');
            const pend = new client_1.Prisma.Decimal(depSum._sum.amount?.toString() ?? '0');
            const debt = new client_1.Prisma.Decimal(debtSum._sum.totalPrice?.toString() ?? '0');
            fieldCashAvailableKd = cash.sub(exp).sub(pend).toFixed(4);
            pendingDepositHoldKd = pend.toFixed(4);
            pendingDebtOrdersKd = debt.toFixed(4);
        }
        let institution = null;
        if (user.safariRole === client_1.SafariRole.ACCOUNTANT) {
            institution = await this.buildInstitutionRadar();
        }
        const priceListVersion = await this.laundryPriceListService.getCatalogVersion();
        let managerCustodyFleet = null;
        let managerCustodyMine = null;
        if (user.safariRole === client_1.SafariRole.OWNER ||
            user.safariRole === client_1.SafariRole.ACCOUNTANT) {
            const m = await this.managerCustodyService.getStreamMetrics();
            managerCustodyFleet = {
                pendingAmountKd: m.fleetPendingAmountKd,
                overdueCount: m.fleetOverdueCount,
                overdueAmountKd: m.fleetOverdueAmountKd,
            };
        }
        if (user.safariRole === client_1.SafariRole.MANAGER) {
            const m = await this.managerCustodyService.getStreamMetrics();
            const mine = m.pendingByManager.find((r) => r.managerId === userId);
            const myAging = await this.managerCustodyService.listAging({
                managerId: userId,
            });
            managerCustodyMine = {
                pendingCount: mine?.count ?? 0,
                pendingAmountKd: mine?.amountKd ?? '0.0000',
                overdueCount: myAging.summary.overdueCount,
            };
        }
        return {
            stream: 'safari-erp-v1',
            user: {
                id: user.id,
                username: user.username,
                fullName: user.fullName,
                phone: user.phone,
                safariRole: user.safariRole,
                branchId: user.branchId,
            },
            wallet: {
                fieldCashAvailableKd,
                pendingDepositHoldKd,
                pendingDebtOrdersKd,
            },
            institution,
            permissions: permissionKeys,
            priceListVersion,
            managerCustody: {
                fleet: managerCustodyFleet,
                mine: managerCustodyMine,
            },
        };
    }
};
exports.SafariStreamService = SafariStreamService;
exports.SafariStreamService = SafariStreamService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        permissions_service_1.PermissionsService,
        operating_hours_service_1.OperatingHoursService,
        reports_service_1.ReportsService,
        laundry_price_list_service_1.LaundryPriceListService,
        manager_custody_service_1.ManagerCustodyService])
], SafariStreamService);
//# sourceMappingURL=safari-stream.service.js.map