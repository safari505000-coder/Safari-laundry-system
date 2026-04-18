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
exports.ManagerCustodyController = void 0;
const node_fs_1 = require("node:fs");
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const multer_1 = require("multer");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const approve_receipt_from_driver_dto_1 = require("./dto/approve-receipt-from-driver.dto");
const list_custody_query_dto_1 = require("./dto/list-custody-query.dto");
const reject_custody_dto_1 = require("./dto/reject-custody.dto");
const upload_deposit_slip_dto_1 = require("./dto/upload-deposit-slip.dto");
const verify_custody_dto_1 = require("./dto/verify-custody.dto");
const manager_custody_service_1 = require("./manager-custody.service");
const DEPOSIT_SLIPS_DIR = (0, node_path_1.join)(process.cwd(), 'uploads', 'deposit-slips');
const DEPOSIT_SLIP_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let ManagerCustodyController = class ManagerCustodyController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    approveReceipt(dto, user) {
        return this.svc.approveReceiptFromDriver(user.userId, user.branchId, dto);
    }
    uploadSlipImage(file) {
        if (!file?.filename) {
            throw new common_1.BadRequestException('Deposit slip image is required');
        }
        return { depositSlipUrl: `/uploads/deposit-slips/${file.filename}` };
    }
    uploadSlip(id, dto, user) {
        return this.svc.uploadDepositSlip(id, user.userId, dto);
    }
    listMine(user) {
        return this.svc.listMine(user.userId);
    }
    verify(id, dto, user) {
        return this.svc.verifyCustody(id, user.userId, dto);
    }
    reject(id, dto, user) {
        return this.svc.rejectCustody(id, user.userId, dto);
    }
    aging(q) {
        return this.svc.listAging(q);
    }
};
exports.ManagerCustodyController = ManagerCustodyController;
__decorate([
    (0, common_1.Post)('approve-receipt'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Manager approves receipt of cash from driver (${branding_1.APP_BRAND})`,
        description: 'Atomic: closes open shift, flips CASH orders → HANDED_OVER_TO_OFFICE (driver balance = 0), opens a ManagerCashCustody bag in PENDING_DEPOSIT. The 24h aging clock starts now.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [approve_receipt_from_driver_dto_1.ApproveReceiptFromDriverDto, Object]),
    __metadata("design:returntype", void 0)
], ManagerCustodyController.prototype, "approveReceipt", null);
__decorate([
    (0, common_1.Post)('upload-slip-image'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['file'],
            properties: { file: { type: 'string', format: 'binary' } },
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: `Upload deposit slip image (${branding_1.APP_BRAND})`,
        description: 'JPEG/PNG/WebP, max ~1MB per Dastur §1. Returns depositSlipUrl for POST /manager-custody/:id/upload-slip.',
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, _file, cb) => {
                if (!(0, node_fs_1.existsSync)(DEPOSIT_SLIPS_DIR)) {
                    (0, node_fs_1.mkdirSync)(DEPOSIT_SLIPS_DIR, { recursive: true });
                }
                cb(null, DEPOSIT_SLIPS_DIR);
            },
            filename: (_req, file, cb) => {
                const ext = (0, node_path_1.extname)(file.originalname).toLowerCase() || '.jpg';
                cb(null, `${(0, node_crypto_1.randomUUID)()}${ext}`);
            },
        }),
        limits: { fileSize: 6 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (DEPOSIT_SLIP_MIMES.has(file.mimetype)) {
                cb(null, true);
            }
            else {
                cb(new common_1.BadRequestException('Only JPEG, PNG, or WebP images are allowed'), false);
            }
        },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ManagerCustodyController.prototype, "uploadSlipImage", null);
__decorate([
    (0, common_1.Post)(':id/upload-slip'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Attach deposit slip to a pending custody bag (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, upload_deposit_slip_dto_1.UploadDepositSlipDto, Object]),
    __metadata("design:returntype", void 0)
], ManagerCustodyController.prototype, "uploadSlip", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: `Manager — my custody bags (${branding_1.APP_BRAND})` }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ManagerCustodyController.prototype, "listMine", null);
__decorate([
    (0, common_1.Post)(':id/verify'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: `Accountant verifies deposit slip (${branding_1.APP_BRAND})`,
        description: 'Only bags in AWAITING_VERIFICATION can be verified. OWNER bypasses globally.',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, verify_custody_dto_1.VerifyCustodyDto, Object]),
    __metadata("design:returntype", void 0)
], ManagerCustodyController.prototype, "verify", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({ summary: `Accountant rejects deposit slip (${branding_1.APP_BRAND})` }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, reject_custody_dto_1.RejectCustodyDto, Object]),
    __metadata("design:returntype", void 0)
], ManagerCustodyController.prototype, "reject", null);
__decorate([
    (0, common_1.Get)('aging'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: `Cash Held by Managers — aging report (${branding_1.APP_BRAND})`,
        description: 'Dastur §3: rows older than 24h without VERIFIED status are flagged as overdue (red in UI).',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_custody_query_dto_1.ListCustodyQueryDto]),
    __metadata("design:returntype", void 0)
], ManagerCustodyController.prototype, "aging", null);
exports.ManagerCustodyController = ManagerCustodyController = __decorate([
    (0, swagger_1.ApiTags)('manager-custody'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('manager-custody'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [manager_custody_service_1.ManagerCustodyService])
], ManagerCustodyController);
//# sourceMappingURL=manager-custody.controller.js.map