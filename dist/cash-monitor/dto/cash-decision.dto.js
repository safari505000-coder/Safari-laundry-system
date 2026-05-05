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
exports.CashDecisionsResponseDto = exports.DecisionSummaryDto = exports.DecisionTopRiskDto = exports.DecisionActionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class DecisionActionDto {
    driverId;
    driverName;
    branchId;
    alertType;
    domain;
    amount;
    action;
    reason;
    urgency;
    recommendedSteps;
    timestamp;
}
exports.DecisionActionDto = DecisionActionDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DecisionActionDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DecisionActionDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DecisionActionDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Underlying operational alert type that produced this decision.' }),
    __metadata("design:type", String)
], DecisionActionDto.prototype, "alertType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['FINANCIAL', 'COMPLIANCE'],
        description: 'Inherited from the classifier. COMPLIANCE actions are advisory and never escalate beyond LOW urgency.',
    }),
    __metadata("design:type", String)
], DecisionActionDto.prototype, "domain", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DecisionActionDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DecisionActionDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DecisionActionDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['HIGH', 'MEDIUM', 'LOW'] }),
    __metadata("design:type", String)
], DecisionActionDto.prototype, "urgency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], DecisionActionDto.prototype, "recommendedSteps", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ISO timestamp from the originating alert.' }),
    __metadata("design:type", String)
], DecisionActionDto.prototype, "timestamp", void 0);
class DecisionTopRiskDto {
    driverId;
    driverName;
    branchId;
    amount;
    issue;
    action;
    urgency;
    recommendedSteps;
    alertType;
}
exports.DecisionTopRiskDto = DecisionTopRiskDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DecisionTopRiskDto.prototype, "driverId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DecisionTopRiskDto.prototype, "driverName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], DecisionTopRiskDto.prototype, "branchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DecisionTopRiskDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Operator-friendly summary of the underlying issue.' }),
    __metadata("design:type", String)
], DecisionTopRiskDto.prototype, "issue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DecisionTopRiskDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['HIGH', 'MEDIUM', 'LOW'] }),
    __metadata("design:type", String)
], DecisionTopRiskDto.prototype, "urgency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], DecisionTopRiskDto.prototype, "recommendedSteps", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DecisionTopRiskDto.prototype, "alertType", void 0);
class DecisionSummaryDto {
    critical;
    warning;
    info;
    totalActions;
}
exports.DecisionSummaryDto = DecisionSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DecisionSummaryDto.prototype, "critical", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DecisionSummaryDto.prototype, "warning", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DecisionSummaryDto.prototype, "info", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DecisionSummaryDto.prototype, "totalActions", void 0);
class CashDecisionsResponseDto {
    timestamp;
    realtimeStatus;
    topRisk;
    actions;
    summary;
    readOnly;
    advisoryOnly;
}
exports.CashDecisionsResponseDto = CashDecisionsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CashDecisionsResponseDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['GREEN', 'YELLOW', 'RED'] }),
    __metadata("design:type", String)
], CashDecisionsResponseDto.prototype, "realtimeStatus", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        nullable: true,
        type: DecisionTopRiskDto,
        description: 'The single most important decision for the operator. Null when no alerts qualify.',
    }),
    __metadata("design:type", Object)
], CashDecisionsResponseDto.prototype, "topRisk", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [DecisionActionDto] }),
    __metadata("design:type", Array)
], CashDecisionsResponseDto.prototype, "actions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", DecisionSummaryDto)
], CashDecisionsResponseDto.prototype, "summary", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true — no data was modified.' }),
    __metadata("design:type", Boolean)
], CashDecisionsResponseDto.prototype, "readOnly", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Always true — recommendations only; no auto-execution.' }),
    __metadata("design:type", Boolean)
], CashDecisionsResponseDto.prototype, "advisoryOnly", void 0);
//# sourceMappingURL=cash-decision.dto.js.map