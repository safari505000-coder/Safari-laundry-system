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
exports.BankDepositsController = void 0;
const node_fs_1 = require("node:fs");
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const multer_1 = require("multer");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const bank_deposits_service_1 = require("./bank-deposits.service");
const bank_deposits_list_query_dto_1 = require("./dto/bank-deposits-list-query.dto");
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
let BankDepositsController = class BankDepositsController {
    bankDepositsService;
    constructor(bankDepositsService) {
        this.bankDepositsService = bankDepositsService;
    }
    list(q) {
        return this.bankDepositsService.list(q);
    }
    async create(file, depositTypeRaw, amountRaw, shiftId, user) {
        if (!file?.filename) {
            throw new common_1.BadRequestException('Receipt file is required');
        }
        const depositType = parseDepositType(depositTypeRaw);
        const amount = Number.parseFloat(amountRaw ?? '');
        if (!Number.isFinite(amount)) {
            throw new common_1.BadRequestException('amount is required and must be a number');
        }
        const url = `/uploads/bank-deposits/${file.filename}`;
        return this.bankDepositsService.createFromUpload(user.userId, url, depositType, amount, shiftId?.trim() || undefined);
    }
    verify(id, user) {
        return this.bankDepositsService.verify(user.userId, id);
    }
};
exports.BankDepositsController = BankDepositsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Bank deposits log (${branding_1.APP_BRAND})`,
        description: 'OWNER: read-only monitoring. ACCOUNTANT: review list. MANAGER: see uploaded items.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bank_deposits_list_query_dto_1.BankDepositsListQueryDto]),
    __metadata("design:returntype", void 0)
], BankDepositsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER),
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
        summary: `Upload cash slip or K-Net Z-report (${branding_1.APP_BRAND})`,
        description: 'MANAGER only. JPEG, PNG, WebP, or PDF, max ~8MB.',
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
], BankDepositsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/verify'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: `Verify deposit matches records (${branding_1.APP_BRAND})`,
        description: 'ACCOUNTANT only — dual control confirmation.',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BankDepositsController.prototype, "verify", null);
exports.BankDepositsController = BankDepositsController = __decorate([
    (0, swagger_1.ApiTags)('finance'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('finance/bank-deposits'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [bank_deposits_service_1.BankDepositsService])
], BankDepositsController);
//# sourceMappingURL=bank-deposits.controller.js.map