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
exports.ManagerDashboardDto = exports.DriverContributionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class DriverContributionDto {
    driverId;
    employeeId;
    username;
    fullName;
    completedOrderCount;
    completedRevenue;
}
exports.DriverContributionDto = DriverContributionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'uuid' }),
    __metadata("design:type", String)
], DriverContributionDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], DriverContributionDto.prototype, "employeeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Staff username / staff ID' }),
    __metadata("design:type", String)
], DriverContributionDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Display name' }),
    __metadata("design:type", String)
], DriverContributionDto.prototype, "fullName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Count of COMPLETED orders attributed to this driver',
    }),
    __metadata("design:type", Number)
], DriverContributionDto.prototype, "completedOrderCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Sum of totalPrice for those completed orders' }),
    __metadata("design:type", String)
], DriverContributionDto.prototype, "completedRevenue", void 0);
class ManagerDashboardDto {
    totalActiveOrders;
    revenueCompletedOrders;
    driverContribution;
}
exports.ManagerDashboardDto = ManagerDashboardDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Orders that are not COMPLETED or CANCELED (still in the operational pipeline)',
    }),
    __metadata("design:type", Number)
], ManagerDashboardDto.prototype, "totalActiveOrders", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sum of totalPrice for all COMPLETED orders',
        example: '125000.5000',
    }),
    __metadata("design:type", String)
], ManagerDashboardDto.prototype, "revenueCompletedOrders", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [DriverContributionDto],
        description: 'Completed order volume and revenue by driver (driver-led business contribution)',
    }),
    __metadata("design:type", Array)
], ManagerDashboardDto.prototype, "driverContribution", void 0);
//# sourceMappingURL=manager-dashboard.dto.js.map