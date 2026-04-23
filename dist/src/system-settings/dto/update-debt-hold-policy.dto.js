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
exports.UpdateDebtHoldPolicyDto = void 0;
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
class UpdateDebtHoldPolicyDto {
    isActive;
    holdMode;
    fixedAmount;
}
exports.UpdateDebtHoldPolicyDto = UpdateDebtHoldPolicyDto;
__decorate([
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateDebtHoldPolicyDto.prototype, "isActive", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.DebtHoldMode),
    __metadata("design:type", String)
], UpdateDebtHoldPolicyDto.prototype, "holdMode", void 0);
__decorate([
    (0, class_validator_1.ValidateIf)((o) => o.holdMode === client_1.DebtHoldMode.FIXED),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateDebtHoldPolicyDto.prototype, "fixedAmount", void 0);
//# sourceMappingURL=update-debt-hold-policy.dto.js.map