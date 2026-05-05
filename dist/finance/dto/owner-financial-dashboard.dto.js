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
exports.OwnerFinancialDashboardDto = exports.RiskyDriverDto = exports.OwnerTopCustomerDto = exports.FinancialAlertDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class FinancialAlertDto {
    type;
    severity;
    entityId;
    message;
    createdAt;
}
exports.FinancialAlertDto = FinancialAlertDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['HIGH_DEBT', 'DRIVER_DELAY', 'EXPENSE_SPIKE', 'CASH_MISMATCH'] }),
    __metadata("design:type", String)
], FinancialAlertDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['LOW', 'MEDIUM', 'HIGH'] }),
    __metadata("design:type", String)
], FinancialAlertDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], FinancialAlertDto.prototype, "entityId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], FinancialAlertDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], FinancialAlertDto.prototype, "createdAt", void 0);
class OwnerTopCustomerDto {
    customerId;
    displayName;
    totalDueKd;
    totalInvoicesKd;
    totalPaymentsKd;
    customerHealth;
    paymentConsistency;
    avgPaymentDelayHours;
    lifetimeValueKd;
}
exports.OwnerTopCustomerDto = OwnerTopCustomerDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OwnerTopCustomerDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], OwnerTopCustomerDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OwnerTopCustomerDto.prototype, "totalDueKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OwnerTopCustomerDto.prototype, "totalInvoicesKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OwnerTopCustomerDto.prototype, "totalPaymentsKd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['GOOD', 'WATCH', 'RISK', 'BLOCKED'] }),
    __metadata("design:type", String)
], OwnerTopCustomerDto.prototype, "customerHealth", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], OwnerTopCustomerDto.prototype, "paymentConsistency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], OwnerTopCustomerDto.prototype, "avgPaymentDelayHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OwnerTopCustomerDto.prototype, "lifetimeValueKd", void 0);
class RiskyDriverDto {
    driverId;
    driverName;
    collectedCash;
    handedCash;
    delayHours;
    riskLevel;
}
exports.RiskyDriverDto = RiskyDriverDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RiskyDriverDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], RiskyDriverDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RiskyDriverDto.prototype, "collectedCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RiskyDriverDto.prototype, "handedCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], RiskyDriverDto.prototype, "delayHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['LOW', 'MEDIUM', 'HIGH', 'WARNING'] }),
    __metadata("design:type", String)
], RiskyDriverDto.prototype, "riskLevel", void 0);
class OwnerFinancialDashboardDto {
    generatedAt;
    totalInvoicesToday;
    totalPaymentsToday;
    totalDueTotal;
    cashInDrivers;
    cashInOffice;
    reconciliationDifference;
    alerts;
    topCustomers;
    riskyDrivers;
}
exports.OwnerFinancialDashboardDto = OwnerFinancialDashboardDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OwnerFinancialDashboardDto.prototype, "generatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OwnerFinancialDashboardDto.prototype, "totalInvoicesToday", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OwnerFinancialDashboardDto.prototype, "totalPaymentsToday", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OwnerFinancialDashboardDto.prototype, "totalDueTotal", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OwnerFinancialDashboardDto.prototype, "cashInDrivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OwnerFinancialDashboardDto.prototype, "cashInOffice", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OwnerFinancialDashboardDto.prototype, "reconciliationDifference", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [FinancialAlertDto] }),
    __metadata("design:type", Array)
], OwnerFinancialDashboardDto.prototype, "alerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [OwnerTopCustomerDto] }),
    __metadata("design:type", Array)
], OwnerFinancialDashboardDto.prototype, "topCustomers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [RiskyDriverDto] }),
    __metadata("design:type", Array)
], OwnerFinancialDashboardDto.prototype, "riskyDrivers", void 0);
//# sourceMappingURL=owner-financial-dashboard.dto.js.map