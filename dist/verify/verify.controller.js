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
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
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
    verifyDebtHold(id) {
        return this.verify.verifyDebtHold(id);
    }
    verifyCashReceipt(id) {
        return this.verify.verifyCashReceipt(id);
    }
    verifyPayrollRoster(token) {
        return this.verify.verifyPayrollRoster(token);
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
__decorate([
    (0, common_1.Get)('debt_hold/:id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify a printed debt-hold voucher',
        description: 'V19.17 — returns { valid, issuedTo, summary } for the debt-hold voucher (تحرير/صرف) referenced by the QR at the bottom of the A4 voucher. No secrets exposed: only the stage + amounts + employee already printed on the page.',
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VerifyController.prototype, "verifyDebtHold", null);
__decorate([
    (0, common_1.Get)('cash_receipt/:id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify a printed driver cash-handover receipt',
        description: 'V19.17 — returns { valid, issuedTo, summary } for the formal cash handover receipt (سند استلام كاش) the manager issued to a driver. The QR at the bottom of the A4 voucher encodes the ManagerCashCustody row UUID.',
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VerifyController.prototype, "verifyCashReceipt", null);
__decorate([
    (0, common_1.Get)('payroll_roster/:token'),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify a printed monthly payroll roster',
        description: 'V19.21 — returns { valid, issuedTo, summary } for the monthly payroll roster (مسير الرواتب الشهري). Token is "YYYY-MM" or "YYYY-MM_<branchId>". Summary fields mirror the printed totals; no per-employee detail is exposed.',
    }),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VerifyController.prototype, "verifyPayrollRoster", null);
exports.VerifyController = VerifyController = __decorate([
    (0, swagger_1.ApiTags)('verify'),
    (0, common_1.Controller)('verify'),
    (0, roles_decorator_1.Public)('Printed-document QR verification returns only data already visible on paper.'),
    __metadata("design:paramtypes", [verify_service_1.VerifyService])
], VerifyController);
//# sourceMappingURL=verify.controller.js.map