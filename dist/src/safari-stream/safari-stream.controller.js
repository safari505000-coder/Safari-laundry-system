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
exports.SafariStreamController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const safari_stream_service_1 = require("./safari-stream.service");
let SafariStreamController = class SafariStreamController {
    safariStream;
    constructor(safariStream) {
        this.safariStream = safariStream;
    }
    snapshot(user) {
        return this.safariStream.buildSnapshot(user.userId, user.role);
    }
};
exports.SafariStreamController = SafariStreamController;
__decorate([
    (0, common_1.Get)('snapshot'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.MANAGER, client_1.SafariRole.DRIVER, client_1.SafariRole.WORKER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.SUPERVISOR, client_1.SafariRole.VIEWER),
    (0, swagger_1.ApiOperation)({
        summary: `SafariStream snapshot (${branding_1.APP_BRAND})`,
        description: 'Global context pipe: authenticated user identity, institutional permission keys, and (for DRIVER) wallet / pending deposit / debt radar figures for live UI.',
    }),
    (0, swagger_1.ApiOkResponse)({ description: 'Snapshot payload' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SafariStreamController.prototype, "snapshot", null);
exports.SafariStreamController = SafariStreamController = __decorate([
    (0, swagger_1.ApiTags)('safari-stream'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('safari-stream'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [safari_stream_service_1.SafariStreamService])
], SafariStreamController);
//# sourceMappingURL=safari-stream.controller.js.map