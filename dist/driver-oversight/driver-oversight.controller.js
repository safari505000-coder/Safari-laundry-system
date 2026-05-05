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
var DriverOversightController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriverOversightController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const driver_oversight_service_1 = require("./driver-oversight.service");
const SSOT_FORBIDDEN_CASH_FIELDS = ['heldCashKd', 'cashTodayKd'];
let DriverOversightController = DriverOversightController_1 = class DriverOversightController {
    svc;
    logger = new common_1.Logger(DriverOversightController_1.name);
    constructor(svc) {
        this.svc = svc;
    }
    async list(user) {
        let rows;
        if (user.role === client_1.SafariRole.MANAGER) {
            rows = await this.svc.listForBranchManager(user.branchId);
        }
        else if (user.role === client_1.SafariRole.OWNER ||
            user.role === client_1.SafariRole.GENERAL_MANAGER) {
            rows = await this.svc.listForAllBranches();
        }
        else {
            throw new common_1.ForbiddenException('Driver oversight is MANAGER-only.');
        }
        this.assertNoForbiddenCashFields(rows);
        return rows;
    }
    assertNoForbiddenCashFields(rows) {
        const offenders = [];
        for (const row of rows) {
            const r = row;
            for (const f of SSOT_FORBIDDEN_CASH_FIELDS) {
                if (r[f] !== null && r[f] !== undefined) {
                    offenders.push({ driverId: row.driverId, field: f, value: r[f] });
                }
            }
        }
        if (offenders.length === 0)
            return;
        const msg = `SSoT VIOLATION: forbidden cash field on /manager/driver-oversight — ${offenders
            .map((o) => `${o.field}=${String(o.value)} (driver=${o.driverId})`)
            .join('; ')}. Driver cash is exposed ONLY by GET /api/cash-intelligence/dashboard.`;
        this.logger.error(msg);
        if (process.env.NODE_ENV !== 'production') {
            throw new Error(msg);
        }
    }
};
exports.DriverOversightController = DriverOversightController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.MANAGER, client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Branch Driver Oversight — daily cards (${branding_1.APP_BRAND})`,
        description: "Returns one `DriverOversightCard` per active DRIVER in the caller's scope. MANAGER → drivers of their own branch (`user.branchId`). OWNER / GENERAL_MANAGER → every active driver across the company. Each card bundles shift status, today's invoice count, pending unsettled invoices, and the stale quick-capture tally (same 24 h threshold as the Accountant watchdog). Driver CASH is intentionally NOT in this payload — it is exposed only by GET /api/cash-intelligence/dashboard (SSoT).",
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DriverOversightController.prototype, "list", null);
exports.DriverOversightController = DriverOversightController = DriverOversightController_1 = __decorate([
    (0, swagger_1.ApiTags)('driver-oversight'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('manager/driver-oversight'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [driver_oversight_service_1.DriverOversightService])
], DriverOversightController);
//# sourceMappingURL=driver-oversight.controller.js.map