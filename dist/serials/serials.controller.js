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
exports.SerialsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const serials_dto_1 = require("./dto/serials.dto");
const serial_gap_service_1 = require("./serial-gap.service");
const serials_service_1 = require("./serials.service");
let SerialsController = class SerialsController {
    serials;
    gaps;
    constructor(serials, gaps) {
        this.serials = serials;
        this.gaps = gaps;
    }
    listDrivers() {
        return this.serials.listDrivers();
    }
    setDriverPrefix(userId, dto) {
        return this.serials.setDriverPrefix(userId, dto.driverPrefix ?? null);
    }
    getSerialLog(limit) {
        const parsed = limit ? Number.parseInt(limit, 10) : 50;
        return this.serials.getSerialLog(Number.isFinite(parsed) ? parsed : 50);
    }
    async getLatestGapReport() {
        return { latest: await this.gaps.latestReport() };
    }
    scanGapsNow() {
        return this.gaps.scanNow();
    }
};
exports.SerialsController = SerialsController;
__decorate([
    (0, common_1.Get)('drivers'),
    (0, swagger_1.ApiOperation)({
        summary: `Drivers & assigned serial prefixes (${branding_1.APP_BRAND})`,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SerialsController.prototype, "listDrivers", null);
__decorate([
    (0, common_1.Patch)('drivers/:userId'),
    (0, swagger_1.ApiOperation)({
        summary: `Set / clear a driver's serial prefix (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, serials_dto_1.SetDriverPrefixDto]),
    __metadata("design:returntype", Promise)
], SerialsController.prototype, "setDriverPrefix", null);
__decorate([
    (0, common_1.Get)('log'),
    (0, swagger_1.ApiOperation)({
        summary: `Global serial log (most recent orders) (${branding_1.APP_BRAND})`,
    }),
    __param(0, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SerialsController.prototype, "getSerialLog", null);
__decorate([
    (0, common_1.Get)('gaps'),
    (0, swagger_1.ApiOperation)({
        summary: `Latest order-serial gap scan (${branding_1.APP_BRAND})`,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SerialsController.prototype, "getLatestGapReport", null);
__decorate([
    (0, common_1.Post)('gaps/scan-now'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Force a fresh order-serial gap scan (OWNER only, ${branding_1.APP_BRAND})`,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SerialsController.prototype, "scanGapsNow", null);
exports.SerialsController = SerialsController = __decorate([
    (0, swagger_1.ApiTags)('owner-serials'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('owner/serials'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    __metadata("design:paramtypes", [serials_service_1.SerialsService,
        serial_gap_service_1.SerialGapService])
], SerialsController);
//# sourceMappingURL=serials.controller.js.map