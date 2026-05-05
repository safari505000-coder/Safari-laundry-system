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
exports.ExpensesSummaryResponseDto = exports.ExpensesSummaryAlertDto = exports.ExpensesSummaryMonthlyDto = exports.ExpensesSummaryByBranchDto = exports.ExpensesSummaryByCategoryDto = exports.ExpensesSummaryByOwnerDto = exports.ExpensesSummaryQueryDto = void 0;
const class_validator_1 = require("class-validator");
class ExpensesSummaryQueryDto {
    from;
    to;
    branchId;
}
exports.ExpensesSummaryQueryDto = ExpensesSummaryQueryDto;
__decorate([
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], ExpensesSummaryQueryDto.prototype, "from", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], ExpensesSummaryQueryDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ExpensesSummaryQueryDto.prototype, "branchId", void 0);
class ExpensesSummaryByOwnerDto {
    ownerType;
    totalKd;
    count;
}
exports.ExpensesSummaryByOwnerDto = ExpensesSummaryByOwnerDto;
class ExpensesSummaryByCategoryDto {
    category;
    totalKd;
    count;
}
exports.ExpensesSummaryByCategoryDto = ExpensesSummaryByCategoryDto;
class ExpensesSummaryByBranchDto {
    branchId;
    branchName;
    totalKd;
    count;
}
exports.ExpensesSummaryByBranchDto = ExpensesSummaryByBranchDto;
class ExpensesSummaryMonthlyDto {
    month;
    totalKd;
    driverKd;
    branchKd;
    companyKd;
}
exports.ExpensesSummaryMonthlyDto = ExpensesSummaryMonthlyDto;
class ExpensesSummaryAlertDto {
    id;
    severity;
    message;
}
exports.ExpensesSummaryAlertDto = ExpensesSummaryAlertDto;
class ExpensesSummaryResponseDto {
    source;
    rangeFromIso;
    rangeToIso;
    branchScope;
    totalApprovedKd;
    totalPendingKd;
    approvedCount;
    byOwnerType;
    byCategory;
    byBranch;
    monthly;
    alerts;
}
exports.ExpensesSummaryResponseDto = ExpensesSummaryResponseDto;
//# sourceMappingURL=expenses-summary.dto.js.map