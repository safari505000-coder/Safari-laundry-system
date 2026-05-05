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
exports.CashFlowAliasesController = void 0;
const node_fs_1 = require("node:fs");
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const multer_1 = require("multer");
const class_validator_1 = require("class-validator");
const swagger_2 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const cash_write_police_guard_1 = require("../cash-monitor/cash-write-police.guard");
const branding_1 = require("../common/constants/branding");
const bank_deposits_service_1 = require("../finance/bank-deposits.service");
const approve_receipt_from_driver_dto_1 = require("./dto/approve-receipt-from-driver.dto");
const reject_custody_dto_1 = require("./dto/reject-custody.dto");
const verify_custody_dto_1 = require("./dto/verify-custody.dto");
const manager_custody_service_1 = require("./manager-custody.service");
const BANK_DEPOSITS_DIR = (0, node_path_1.join)(process.cwd(), 'uploads', 'bank-deposits');
const BANK_DEPOSIT_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
]);
function parseDepositType(raw) {
    if (raw === 'CASH_DEPOSIT_SLIP' || raw === 'KNET_Z_REPORT') {
        return raw;
    }
    throw new common_1.BadRequestException('depositType must be CASH_DEPOSIT_SLIP or KNET_Z_REPORT');
}
class VerifyDepositAliasDto extends verify_custody_dto_1.VerifyCustodyDto {
    custodyId;
}
__decorate([
    (0, swagger_2.ApiProperty)({ format: 'uuid' }),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], VerifyDepositAliasDto.prototype, "custodyId", void 0);
class RejectCustodyAliasDto extends reject_custody_dto_1.RejectCustodyDto {
    custodyId;
}
__decorate([
    (0, swagger_2.ApiProperty)({ format: 'uuid' }),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], RejectCustodyAliasDto.prototype, "custodyId", void 0);
let CashFlowAliasesController = class CashFlowAliasesController {
    managerCustody;
    bankDeposits;
    constructor(managerCustody, bankDeposits) {
        this.managerCustody = managerCustody;
        this.bankDeposits = bankDeposits;
    }
    getCashStatus(user) {
        return this.managerCustody.getCashStatusSnapshot(user.userId);
    }
    handoverCash(dto, user) {
        return this.managerCustody.approveReceiptFromDriver(user.userId, user.branchId, dto);
    }
    verifyDeposit(dto, user) {
        const { custodyId, ...rest } = dto;
        return this.managerCustody.verifyCustody(custodyId, user.userId, rest);
    }
    rejectCustody(dto, user) {
        const { custodyId, ...rest } = dto;
        return this.managerCustody.rejectCustody(custodyId, user.userId, rest);
    }
    async uploadSlip(file, depositTypeRaw, amountRaw, shiftId, user) {
        if (!file?.filename) {
            throw new common_1.BadRequestException('Receipt file is required');
        }
        const depositType = parseDepositType(depositTypeRaw);
        const amount = Number.parseFloat(amountRaw ?? '');
        if (!Number.isFinite(amount)) {
            throw new common_1.BadRequestException('amount is required and must be a number');
        }
        const url = `/uploads/bank-deposits/${file.filename}`;
        return this.bankDeposits.createFromUpload(user.userId, url, depositType, amount, shiftId?.trim() || undefined, user.role);
    }
};
exports.CashFlowAliasesController = CashFlowAliasesController;
__decorate([
    (0, common_1.Get)('manager/cash-status'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Operational snapshot of cash held by the calling manager (${branding_1.APP_BRAND})`,
        description: 'STRICT operational view. Returns pendingDepositKd, bagsCount, lastHandoverAt only — no analytics, no totals beyond what the manager physically holds, no ledger access.',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CashFlowAliasesController.prototype, "getCashStatus", null);
__decorate([
    (0, common_1.Post)('driver/handover-cash'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER),
    (0, cash_write_police_guard_1.CashWriteEndpoint)(client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Driver → Manager cash handover (alias of manager-custody/approve-receipt) (${branding_1.APP_BRAND})`,
        description: 'Thin alias for the canonical handover endpoint. Caller is the branch MANAGER (Dastur §3 — manager-pulls-from-driver model). Atomic settlement via CashService.confirmHandover; creates a ManagerCashCustody bag in PENDING_DEPOSIT and emits CASH_HANDOVER_TRANSFER. The 24h aging clock starts now.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [approve_receipt_from_driver_dto_1.ApproveReceiptFromDriverDto, Object]),
    __metadata("design:returntype", void 0)
], CashFlowAliasesController.prototype, "handoverCash", null);
__decorate([
    (0, common_1.Post)('accountant/verify-deposit'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.ACCOUNTANT),
    (0, cash_write_police_guard_1.CashWriteEndpoint)(client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: `Accountant verifies a manager custody bag (alias of manager-custody/:id/verify) (${branding_1.APP_BRAND})`,
        description: 'Thin alias. Flips ManagerCashCustody → VERIFIED, emits CASH_DEPOSIT_VERIFIED, and the LedgerProjectionService will surface the DR BANK_ACCOUNT / CR MANAGER_<id> pair on the next /api/finance/ledger/* call.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [VerifyDepositAliasDto, Object]),
    __metadata("design:returntype", void 0)
], CashFlowAliasesController.prototype, "verifyDeposit", null);
__decorate([
    (0, common_1.Post)('accountant/reject-custody'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.ACCOUNTANT),
    (0, cash_write_police_guard_1.CashWriteEndpoint)(client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: `Accountant rejects a manager custody bag (alias of manager-custody/:id/reject) (${branding_1.APP_BRAND})`,
        description: 'Thin alias. Returns the bag to PENDING_DEPOSIT and emits CASH_HANDOVER_REJECTED. Mounted under /api/accountant/ rather than /api/manager/ because the rejection authority is the accountant — a manager cannot reject their own bag.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [RejectCustodyAliasDto, Object]),
    __metadata("design:returntype", void 0)
], CashFlowAliasesController.prototype, "rejectCustody", null);
__decorate([
    (0, common_1.Post)('bank-deposits/upload-slip'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER),
    (0, cash_write_police_guard_1.CashWriteEndpoint)(client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['file', 'depositType', 'amount'],
            properties: {
                file: { type: 'string', format: 'binary' },
                depositType: {
                    type: 'string',
                    enum: ['CASH_DEPOSIT_SLIP', 'KNET_Z_REPORT'],
                },
                amount: { type: 'string', example: '125.5000' },
                shiftId: { type: 'string', format: 'uuid' },
            },
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: `Upload bank deposit slip (alias of finance/bank-deposits) (${branding_1.APP_BRAND})`,
        description: 'Thin alias for the canonical upload. Same multipart contract, same coverage check (emits CASH_DEPOSIT_UNCOVERED with suspicious=true if declared amount exceeds held custody — never blocks the flow).',
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, _file, cb) => {
                if (!(0, node_fs_1.existsSync)(BANK_DEPOSITS_DIR)) {
                    (0, node_fs_1.mkdirSync)(BANK_DEPOSITS_DIR, { recursive: true });
                }
                cb(null, BANK_DEPOSITS_DIR);
            },
            filename: (_req, file, cb) => {
                const ext = (0, node_path_1.extname)(file.originalname).toLowerCase() || '.jpg';
                cb(null, `${(0, node_crypto_1.randomUUID)()}${ext}`);
            },
        }),
        limits: { fileSize: 8 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (BANK_DEPOSIT_MIMES.has(file.mimetype)) {
                cb(null, true);
            }
            else {
                cb(new common_1.BadRequestException('Only JPEG, PNG, WebP, or PDF files are allowed'), false);
            }
        },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)('depositType')),
    __param(2, (0, common_1.Body)('amount')),
    __param(3, (0, common_1.Body)('shiftId')),
    __param(4, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], CashFlowAliasesController.prototype, "uploadSlip", null);
exports.CashFlowAliasesController = CashFlowAliasesController = __decorate([
    (0, swagger_1.ApiTags)('cash-flow-aliases'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [manager_custody_service_1.ManagerCustodyService,
        bank_deposits_service_1.BankDepositsService])
], CashFlowAliasesController);
//# sourceMappingURL=cash-flow-aliases.controller.js.map