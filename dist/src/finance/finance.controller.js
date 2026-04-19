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
exports.FinanceController = void 0;
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
const confirm_handover_dto_1 = require("./dto/confirm-handover.dto");
const debt_by_category_query_dto_1 = require("./dto/debt-by-category-query.dto");
const daily_pos_sales_query_dto_1 = require("./dto/daily-pos-sales-query.dto");
const update_driver_tracking_dto_1 = require("./dto/update-driver-tracking.dto");
const finance_service_1 = require("./finance.service");
const HANDOVER_RECEIPTS_DIR = (0, node_path_1.join)(process.cwd(), 'uploads', 'handover-receipts');
const HANDOVER_RECEIPT_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);
let FinanceController = class FinanceController {
    financeService;
    constructor(financeService) {
        this.financeService = financeService;
    }
    async driverEnsureShift(user) {
        await this.financeService.ensureOpenShiftForDriver(user.userId);
        return { ok: true };
    }
    getOwnerCustomerWalletSummary() {
        return this.financeService.getOwnerCustomerWalletSummary();
    }
    getDailyPosSales(q, user) {
        return this.financeService.getDailyPosSalesByPaymentMethod(q.from, q.to, user.role === client_1.SafariRole.DRIVER ? user.userId : undefined);
    }
    getDebtByCategory(q) {
        return this.financeService.getDebtBreakdownByCategory(q.from, q.to, q.category, q.branchId, q.actorUserId);
    }
    uploadHandoverReceipt(file) {
        if (!file?.filename) {
            throw new common_1.BadRequestException('Receipt image is required');
        }
        return {
            depositReceiptUrl: `/uploads/handover-receipts/${file.filename}`,
        };
    }
    getDriverBalance() {
        return this.financeService.getDriverBalances();
    }
    getDriverMonitoring() {
        return this.financeService.getDriverMonitoring();
    }
    updateDriverTracking(driverId, dto) {
        return this.financeService.updateDriverTracking(driverId, dto);
    }
    confirmHandover(dto, user) {
        return this.financeService.confirmHandover(user.userId, dto);
    }
    getFinancialCycleReport() {
        return this.financeService.getOwnerFinancialCycleReport();
    }
    getRealtimeTotals() {
        return this.financeService.getRealtimeTotals();
    }
};
exports.FinanceController = FinanceController;
__decorate([
    (0, common_1.Post)('driver/ensure-shift'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.DRIVER),
    (0, swagger_1.ApiOperation)({
        summary: `Driver — ensure open shift (auto-rollover) (${branding_1.APP_BRAND})`,
        description: 'Driver-only. Ensures exactly one OPEN shift and auto-locks yesterday shift at 23:59:59 Kuwait when crossing midnight.',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "driverEnsureShift", null);
__decorate([
    (0, common_1.Get)('owner/customer-wallet-summary'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Owner — customer wallet liabilities & debts (${branding_1.APP_BRAND})`,
        description: 'OWNER only. Aggregates CustomerWallet balance (prepaid credit owed) and debt across all customers.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "getOwnerCustomerWalletSummary", null);
__decorate([
    (0, common_1.Get)('reports/daily-pos-sales'),
    (0, roles_decorator_1.AllowDriverDailyPosSales)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR),
    (0, swagger_1.ApiOperation)({
        summary: `Daily POS sales by payment method (${branding_1.APP_BRAND})`,
        description: 'Aggregates completed POS orders with recorded PosPaymentMethod (subscription wallet, cash, KNET, ONLINE, DEBT_ON_ACCOUNT) for financial reporting.',
    }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [daily_pos_sales_query_dto_1.DailyPosSalesQueryDto, Object]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getDailyPosSales", null);
__decorate([
    (0, common_1.Get)('reports/debt-by-category'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR),
    (0, swagger_1.ApiOperation)({
        summary: `Debt breakdown by category (${branding_1.APP_BRAND})`,
        description: 'Debt totals grouped by category (BRANCH, DRIVER, OWNER, CALL_CENTER) and source (SUBSCRIPTION_OVERUSE, INVOICE_SHORTFALL).',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [debt_by_category_query_dto_1.DebtByCategoryQueryDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getDebtByCategory", null);
__decorate([
    (0, common_1.Post)('handover/upload-receipt'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['file'],
            properties: {
                file: { type: 'string', format: 'binary' },
            },
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: `Upload bank deposit receipt image (${branding_1.APP_BRAND})`,
        description: 'JPEG, PNG, or WebP, max ~6MB. Returns depositReceiptUrl for POST /finance/handover/confirm.',
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, _file, cb) => {
                if (!(0, node_fs_1.existsSync)(HANDOVER_RECEIPTS_DIR)) {
                    (0, node_fs_1.mkdirSync)(HANDOVER_RECEIPTS_DIR, { recursive: true });
                }
                cb(null, HANDOVER_RECEIPTS_DIR);
            },
            filename: (_req, file, cb) => {
                const ext = (0, node_path_1.extname)(file.originalname).toLowerCase() || '.jpg';
                cb(null, `${(0, node_crypto_1.randomUUID)()}${ext}`);
            },
        }),
        limits: { fileSize: 6 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (HANDOVER_RECEIPT_MIMES.has(file.mimetype)) {
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
], FinanceController.prototype, "uploadHandoverReceipt", null);
__decorate([
    (0, common_1.Get)('driver-balance'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `Driver cash on hand (${branding_1.APP_BRAND})`,
        description: 'Per driver: sum of COMPLETED orders still PAID_TO_DRIVER (not yet handed to office), plus current OPEN shift metadata. OWNER/MANAGER only.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "getDriverBalance", null);
__decorate([
    (0, common_1.Get)('driver-monitoring'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Driver monitoring map feed (${branding_1.APP_BRAND})`,
        description: 'OWNER only. Safari Pulse map feed of active ON_SHIFT drivers with lastKnownLocation markers. Locked to OWNER at the API layer regardless of UI route guards.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getDriverMonitoring", null);
__decorate([
    (0, common_1.Patch)('driver-monitoring/:driverId'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Owner test hook — update driver map fields (${branding_1.APP_BRAND})`,
        description: 'OWNER only. Updates vehicleLabel and lastKnownLocation for map testing before live GPS integration.',
    }),
    __param(0, (0, common_1.Param)('driverId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_driver_tracking_dto_1.UpdateDriverTrackingDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "updateDriverTracking", null);
__decorate([
    (0, common_1.Post)('handover/confirm'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Confirm cash handover (${branding_1.APP_BRAND})`,
        description: 'Atomic settlement: all PAID_TO_DRIVER orders for the driver → HANDED_OVER_TO_OFFICE; OPEN shift → CLOSED with ledger totals. Optional declaredHandoverTotal must match ledger within 0.0001 KWD.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [confirm_handover_dto_1.ConfirmHandoverDto, Object]),
    __metadata("design:returntype", Promise)
], FinanceController.prototype, "confirmHandover", null);
__decorate([
    (0, common_1.Get)('reports/financial-cycle'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Owner financial cycle report (${branding_1.APP_BRAND})`,
        description: 'Read-only lifecycle: CASH order → collected by manager (handover) → verified by accountant (deposit verification).',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getFinancialCycleReport", null);
__decorate([
    (0, common_1.Get)('dashboard/realtime-totals'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `Realtime financial dashboard totals (${branding_1.APP_BRAND})`,
        description: 'Card totals for cash with drivers, online revenue, total debt, and subscription usage.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getRealtimeTotals", null);
exports.FinanceController = FinanceController = __decorate([
    (0, swagger_1.ApiTags)('finance'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('finance'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [finance_service_1.FinanceService])
], FinanceController);
//# sourceMappingURL=finance.controller.js.map