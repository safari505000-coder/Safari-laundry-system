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
exports.CashTimelineResponseDto = exports.CashTimelineEventDto = exports.CashReconciliationDto = exports.CashFlowControlDto = exports.CashControlAlertDto = exports.CashDriverBreakdownDto = exports.CashResponsibilityDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CashResponsibilityDto {
    responsible;
    amount;
    delayHours;
    severity;
}
exports.CashResponsibilityDto = CashResponsibilityDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['DRIVER', 'BRANCH', 'ACCOUNTING'] }),
    __metadata("design:type", String)
], CashResponsibilityDto.prototype, "responsible", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashResponsibilityDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CashResponsibilityDto.prototype, "delayHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['LOW', 'MEDIUM', 'HIGH'] }),
    __metadata("design:type", String)
], CashResponsibilityDto.prototype, "severity", void 0);
class CashDriverBreakdownDto {
    driverId;
    driverName;
    collected;
    handed;
    difference;
    status;
}
exports.CashDriverBreakdownDto = CashDriverBreakdownDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashDriverBreakdownDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashDriverBreakdownDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashDriverBreakdownDto.prototype, "collected", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashDriverBreakdownDto.prototype, "handed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashDriverBreakdownDto.prototype, "difference", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['OK', 'MISMATCH', 'CRITICAL'] }),
    __metadata("design:type", String)
], CashDriverBreakdownDto.prototype, "status", void 0);
class CashControlAlertDto {
    type;
    severity;
    entityId;
    message;
}
exports.CashControlAlertDto = CashControlAlertDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashControlAlertDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['LOW', 'MEDIUM', 'HIGH'] }),
    __metadata("design:type", String)
], CashControlAlertDto.prototype, "severity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashControlAlertDto.prototype, "entityId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashControlAlertDto.prototype, "message", void 0);
class CashFlowControlDto {
    custodyId;
    shiftId;
    custodyAmount;
    linkedOrdersTotal;
    depositId;
    depositStatus;
    auditComplete;
    anomalyFlags;
}
exports.CashFlowControlDto = CashFlowControlDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashFlowControlDto.prototype, "custodyId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashFlowControlDto.prototype, "shiftId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashFlowControlDto.prototype, "custodyAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashFlowControlDto.prototype, "linkedOrdersTotal", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashFlowControlDto.prototype, "depositId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['MISSING', 'PENDING', 'VERIFIED', 'AMOUNT_MISMATCH'] }),
    __metadata("design:type", String)
], CashFlowControlDto.prototype, "depositStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], CashFlowControlDto.prototype, "auditComplete", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], CashFlowControlDto.prototype, "anomalyFlags", void 0);
class CashReconciliationDto {
    date;
    branchId;
    expectedCash;
    collectedByDrivers;
    handedToBranch;
    receivedByManager;
    depositedToBank;
    differenceDriver;
    differenceBranch;
    differenceBank;
    totalDifference;
    status;
    breakdown;
    accountability;
    alerts;
    depositStatus;
    auditComplete;
    flows;
    reconciliationMode;
    ignoredTimingMismatch;
    actionsTaken;
}
exports.CashReconciliationDto = CashReconciliationDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashReconciliationDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "expectedCash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "collectedByDrivers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "handedToBranch", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "receivedByManager", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "depositedToBank", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "differenceDriver", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "differenceBranch", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "differenceBank", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "totalDifference", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['OK', 'MISMATCH', 'CRITICAL'] }),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CashDriverBreakdownDto] }),
    __metadata("design:type", Array)
], CashReconciliationDto.prototype, "breakdown", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CashResponsibilityDto] }),
    __metadata("design:type", Array)
], CashReconciliationDto.prototype, "accountability", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CashControlAlertDto] }),
    __metadata("design:type", Array)
], CashReconciliationDto.prototype, "alerts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['MISSING', 'PENDING', 'VERIFIED', 'MIXED'] }),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "depositStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], CashReconciliationDto.prototype, "auditComplete", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CashFlowControlDto] }),
    __metadata("design:type", Array)
], CashReconciliationDto.prototype, "flows", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashReconciliationDto.prototype, "reconciliationMode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], CashReconciliationDto.prototype, "ignoredTimingMismatch", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], CashReconciliationDto.prototype, "actionsTaken", void 0);
class CashTimelineEventDto {
    type;
    timestamp;
    amount;
    userId;
    sourceId;
}
exports.CashTimelineEventDto = CashTimelineEventDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['ORDER_COLLECTED', 'DRIVER_HANDOVER', 'MANAGER_CONFIRMED', 'BANK_DEPOSITED'] }),
    __metadata("design:type", String)
], CashTimelineEventDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashTimelineEventDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashTimelineEventDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], CashTimelineEventDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashTimelineEventDto.prototype, "sourceId", void 0);
class CashTimelineResponseDto {
    events;
}
exports.CashTimelineResponseDto = CashTimelineResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CashTimelineEventDto] }),
    __metadata("design:type", Array)
], CashTimelineResponseDto.prototype, "events", void 0);
//# sourceMappingURL=cash-control.dto.js.map