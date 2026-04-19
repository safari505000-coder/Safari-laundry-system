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
exports.AttendanceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const attendance_service_1 = require("./attendance.service");
const biometric_event_dto_1 = require("./dto/biometric-event.dto");
const list_attendance_query_dto_1 = require("./dto/list-attendance-query.dto");
const manual_attendance_dto_1 = require("./dto/manual-attendance.dto");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
let AttendanceController = class AttendanceController {
    attendance;
    constructor(attendance) {
        this.attendance = attendance;
    }
    list(q) {
        return this.attendance.list(q);
    }
    manual(dto, user) {
        return this.attendance.upsertManual(user.role, dto);
    }
    sync(from, to) {
        return this.attendance.triggerSync(from, to);
    }
    biometric(dto) {
        return this.attendance.recordBiometricEvent(dto);
    }
};
exports.AttendanceController = AttendanceController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: `List attendance rows (${branding_1.APP_BRAND})`,
        description: 'Returns up to 500 attendance rows matching the filters. Dates are logical Kuwait-local days. DUSTUR §6.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_attendance_query_dto_1.ListAttendanceQueryDto]),
    __metadata("design:returntype", void 0)
], AttendanceController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('manual'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: `Create / correct an attendance row manually (${branding_1.APP_BRAND})`,
        description: 'Admin / HR correction channel. Upserts the (userId, date) pair and stamps source=MANUAL.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [manual_attendance_dto_1.ManualAttendanceDto, Object]),
    __metadata("design:returntype", void 0)
], AttendanceController.prototype, "manual", null);
__decorate([
    (0, common_1.Post)('sync'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Back-fill attendance from shifts (${branding_1.APP_BRAND})`,
        description: 'OWNER-only. Manually runs the SHIFT_AUTO sync for a specific [from,to) range. Idempotent.',
    }),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AttendanceController.prototype, "sync", null);
__decorate([
    (0, common_1.Post)('biometric'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({
        summary: `Biometric device webhook (${branding_1.APP_BRAND}, HR-BIO-001 stub)`,
        description: 'Accepts fingerprint / face-scan events and upserts the matching (userId, Kuwait-date) row. The concrete vendor driver plugs in later without changing this contract.',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [biometric_event_dto_1.BiometricEventDto]),
    __metadata("design:returntype", void 0)
], AttendanceController.prototype, "biometric", null);
exports.AttendanceController = AttendanceController = __decorate([
    (0, swagger_1.ApiTags)('attendance'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('attendance'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [attendance_service_1.AttendanceService])
], AttendanceController);
//# sourceMappingURL=attendance.controller.js.map