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
exports.MarkOrderPaidDto = exports.MARK_PAID_METHODS = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
exports.MARK_PAID_METHODS = [
    'CASH',
    'KNET',
    'PAYMENT_LINK',
    'ONLINE',
];
class MarkOrderPaidDto {
    paymentMethod;
}
exports.MarkOrderPaidDto = MarkOrderPaidDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: exports.MARK_PAID_METHODS,
        example: 'CASH',
        description: 'Collection method the customer actually used: Cash, KNET terminal, hosted Payment Link, or Online checkout.',
    }),
    (0, class_validator_1.IsIn)(exports.MARK_PAID_METHODS, {
        message: 'paymentMethod must be one of: CASH, KNET, PAYMENT_LINK, ONLINE',
    }),
    __metadata("design:type", String)
], MarkOrderPaidDto.prototype, "paymentMethod", void 0);
//# sourceMappingURL=mark-order-paid.dto.js.map