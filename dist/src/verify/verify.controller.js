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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerifyController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const verify_service_1 = require("./verify.service");
let VerifyController = class VerifyController {
    verify;
    constructor(verify) {
        this.verify = verify;
    }
    verifyPayslip(id) {
        return this.verify.verifyPayslip(id);
    }
    verifyLeave(id) {
        return this.verify.verifyLeave(id);
    }
    verifyLoan(id) {
        return this.verify.verifyLoan(id);
    }
    verifyStatement(id) {
        return this.verify.verifyStatement(id);
    }
};
exports.VerifyController = VerifyController;
__decorate([
    (0, common_1.Get)('payslip/:id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify a printed payslip',
        description: 'Stage-D — returns { valid, issuedTo, summary } for the payslip referenced by the QR on the printed A4 form. No secrets: only what the page already shows.',
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VerifyController.prototype, "verifyPayslip", null);
__decorate([
    (0, common_1.Get)('leave_request/:id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify a printed leave request',
        description: 'Stage-D — returns { valid, issuedTo, summary } for the leave request referenced by the QR on the printed A4 form.',
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VerifyController.prototype, "verifyLeave", null);
__decorate([
    (0, common_1.Get)('employee_loan/:id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify a printed employee loan',
        description: 'Stage-D — returns { valid, issuedTo, summary } for the loan acknowledgement referenced by the QR on the printed A4 form.',
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VerifyController.prototype, "verifyLoan", null);
__decorate([
    (0, common_1.Get)('statement/:id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify a printed customer statement',
        description: 'V19.8.4 — returns { valid, issuedTo, summary } for the customer statement referenced by the QR at the bottom of the printed A4 page.',
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VerifyController.prototype, "verifyStatement", null);
exports.VerifyController = VerifyController = __decorate([
    (0, swagger_1.ApiTags)('verify'),
    (0, common_1.Controller)('verify'),
    __metadata("design:paramtypes", [verify_service_1.VerifyService])
], VerifyController);
//# sourceMappingURL=verify.controller.js.map