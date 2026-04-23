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
exports.ShiftsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const shift_cycle_service_1 = require("./shift-cycle.service");
let ShiftsController = class ShiftsController {
    shiftCycle;
    constructor(shiftCycle) {
        this.shiftCycle = shiftCycle;
    }
    getCurrentCycle() {
        return this.shiftCycle.getCurrentCycle();
    }
    getRecentCycles(days) {
        const n = days ? Number.parseInt(days, 10) : 7;
        return this.shiftCycle.getRecentCycles(Number.isFinite(n) ? n : 7);
    }
    runNow() {
        return this.shiftCycle.runDailyCycle();
    }
};
exports.ShiftsController = ShiftsController;
__decorate([
    (0, common_1.Get)('cycle/current'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `Current financial cycle snapshot (${branding_1.APP_BRAND})`,
        description: 'Returns the Kuwait-midnight cycle window, driver coverage, and stale shift count. Used by the Owner control panel.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ShiftsController.prototype, "getCurrentCycle", null);
__decorate([
    (0, common_1.Get)('cycle/recent'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Recent cycle history (${branding_1.APP_BRAND})`,
        description: 'Aggregated open/close counts per Kuwait-midnight cycle. Default = last 7 cycles, cap 30.',
    }),
    __param(0, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ShiftsController.prototype, "getRecentCycles", null);
__decorate([
    (0, common_1.Post)('cycle/run-now'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Manually trigger the midnight cycle (${branding_1.APP_BRAND}, OWNER master override)`,
        description: 'OWNER-only fallback. Closes stale OPEN shifts and opens fresh shifts for every active driver. Idempotent.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ShiftsController.prototype, "runNow", null);
exports.ShiftsController = ShiftsController = __decorate([
    (0, swagger_1.ApiTags)('shifts'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('shifts'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [shift_cycle_service_1.ShiftCycleService])
], ShiftsController);
//# sourceMappingURL=shifts.controller.js.map