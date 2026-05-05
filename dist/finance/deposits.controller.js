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
exports.DepositsController = void 0;
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
const deposits_list_query_dto_1 = require("./dto/deposits-list-query.dto");
const update_deposit_status_dto_1 = require("./dto/update-deposit-status.dto");
const deposits_service_1 = require("./deposits.service");
const DEPOSITS_DIR = (0, node_path_1.join)(process.cwd(), 'uploads', 'deposits');
const DEPOSIT_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
]);
function parseDepositType(raw) {
    if (raw === 'CASH' || raw === 'KNET')
        return raw;
    throw new common_1.BadRequestException('type must be CASH or KNET');
}
let DepositsController = class DepositsController {
    depositsService;
    constructor(depositsService) {
        this.depositsService = depositsService;
    }
    list(user, q) {
        return this.depositsService.listForUser(user.userId, user.role, q);
    }
    create(user, file, amountRaw, typeRaw) {
        if (!file?.filename) {
            throw new common_1.BadRequestException('Receipt file is required');
        }
        const amount = Number.parseFloat(amountRaw ?? '');
        if (!Number.isFinite(amount)) {
            throw new common_1.BadRequestException('amount must be a number');
        }
        const type = parseDepositType(typeRaw);
        const url = `/uploads/deposits/${file.filename}`;
        return this.depositsService.createByDriver(user.userId, amount, type, url);
    }
    updateStatus(user, id, dto) {
        return this.depositsService.updateStatus(user.userId, user.role, id, dto);
    }
};
exports.DepositsController = DepositsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.DRIVER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Deposits audit queue (${branding_1.APP_BRAND})`,
        description: 'DRIVER sees own requests. ACCOUNTANT/OWNER can filter by status and driver.',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, deposits_list_query_dto_1.DepositsListQueryDto]),
    __metadata("design:returntype", void 0)
], DepositsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.DRIVER),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['file', 'amount', 'type'],
            properties: {
                file: { type: 'string', format: 'binary' },
                amount: { type: 'string', example: '25.7500' },
                type: { type: 'string', enum: ['CASH', 'KNET'] },
            },
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: `Driver submits deposit request (${branding_1.APP_BRAND})`,
        description: 'Creates a PENDING deposit request with receipt image/pdf.',
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, _file, cb) => {
                if (!(0, node_fs_1.existsSync)(DEPOSITS_DIR)) {
                    (0, node_fs_1.mkdirSync)(DEPOSITS_DIR, { recursive: true });
                }
                cb(null, DEPOSITS_DIR);
            },
            filename: (_req, file, cb) => {
                const ext = (0, node_path_1.extname)(file.originalname).toLowerCase() || '.jpg';
                cb(null, `${(0, node_crypto_1.randomUUID)()}${ext}`);
            },
        }),
        limits: { fileSize: 8 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (DEPOSIT_MIMES.has(file.mimetype))
                cb(null, true);
            else {
                cb(new common_1.BadRequestException('Only JPEG, PNG, WebP, or PDF are allowed'), false);
            }
        },
    })),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)('amount')),
    __param(3, (0, common_1.Body)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", void 0)
], DepositsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Accountant/Owner audits deposit (${branding_1.APP_BRAND})`,
        description: 'APPROVED triggers liability reduction via DebtService and updates wallet cash/bank balance.',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_deposit_status_dto_1.UpdateDepositStatusDto]),
    __metadata("design:returntype", void 0)
], DepositsController.prototype, "updateStatus", null);
exports.DepositsController = DepositsController = __decorate([
    (0, swagger_1.ApiTags)('finance'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('finance/deposits'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [deposits_service_1.DepositsService])
], DepositsController);
//# sourceMappingURL=deposits.controller.js.map