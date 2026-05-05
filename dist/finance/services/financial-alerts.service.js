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
exports.FinancialAlertsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const driver_risk_service_1 = require("./driver-risk.service");
let FinancialAlertsService = class FinancialAlertsService {
    driverRisk;
    constructor(driverRisk) {
        this.driverRisk = driverRisk;
    }
    async buildAlerts(input) {
        const now = input.now ?? new Date();
        const riskyDrivers = input.riskyDrivers ?? (await this.driverRisk.getRiskyDrivers(10));
        const alerts = [];
        for (const customer of input.topCustomers) {
            if (Number.parseFloat(customer.totalDueKd) > 500) {
                alerts.push({
                    type: 'HIGH_DEBT',
                    severity: 'HIGH',
                    entityId: customer.customerId,
                    message: `${customer.displayName ?? customer.customerId}: outstanding ${customer.totalDueKd} KWD`,
                    createdAt: now.toISOString(),
                });
            }
        }
        for (const driver of riskyDrivers) {
            if (driver.riskLevel === 'LOW')
                continue;
            alerts.push({
                type: 'DRIVER_DELAY',
                severity: driver.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
                entityId: driver.driverId,
                message: `${driver.driverName ?? driver.driverId}: cash delay ${driver.delayHours}h, collected ${driver.collectedCash} KWD`,
                createdAt: now.toISOString(),
            });
        }
        const diff = Math.abs(Number.parseFloat(input.reconciliationDifferenceKd));
        if (Number.isFinite(diff) && diff > 0.001) {
            alerts.push({
                type: 'CASH_MISMATCH',
                severity: diff >= 10 ? 'HIGH' : 'MEDIUM',
                entityId: 'cash-reconciliation',
                message: `Cash reconciliation difference ${input.reconciliationDifferenceKd} KWD`,
                createdAt: now.toISOString(),
            });
        }
        const current = Number.parseFloat(input.expenseCurrentKd);
        const previous = Number.parseFloat(input.expensePreviousKd);
        if (Number.isFinite(current) && Number.isFinite(previous) && previous > 0 && current / previous >= 1.5) {
            alerts.push({
                type: 'EXPENSE_SPIKE',
                severity: 'LOW',
                entityId: 'expenses',
                message: `Expenses ${input.expenseCurrentKd} KWD vs ${input.expensePreviousKd} KWD previous window`,
                createdAt: now.toISOString(),
            });
        }
        return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.type.localeCompare(b.type));
    }
    async expenseWindowTotals(prisma, current, previous) {
        const [cur, prev] = await Promise.all([
            prisma.branchExpense.aggregate({
                where: {
                    status: client_1.ExpenseStatus.APPROVED,
                    expenseDate: { gte: current.from, lte: current.to },
                },
                _sum: { amount: true },
            }),
            prisma.branchExpense.aggregate({
                where: {
                    status: client_1.ExpenseStatus.APPROVED,
                    expenseDate: { gte: previous.from, lte: previous.to },
                },
                _sum: { amount: true },
            }),
        ]);
        return {
            currentKd: cur._sum?.amount?.toFixed(4) ?? '0.0000',
            previousKd: prev._sum?.amount?.toFixed(4) ?? '0.0000',
        };
    }
};
exports.FinancialAlertsService = FinancialAlertsService;
exports.FinancialAlertsService = FinancialAlertsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [driver_risk_service_1.DriverRiskService])
], FinancialAlertsService);
function severityRank(severity) {
    if (severity === 'HIGH')
        return 3;
    if (severity === 'MEDIUM')
        return 2;
    return 1;
}
//# sourceMappingURL=financial-alerts.service.js.map