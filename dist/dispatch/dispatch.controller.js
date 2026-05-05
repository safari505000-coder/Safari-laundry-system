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
exports.DispatchController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const permissions_decorator_1 = require("../auth/permissions/permissions.decorator");
const permissions_enum_1 = require("../auth/permissions/permissions.enum");
const create_dispatch_dto_1 = require("./dto/create-dispatch.dto");
const reassign_dispatch_dto_1 = require("./dto/reassign-dispatch.dto");
const dispatch_service_1 = require("./dispatch.service");
let DispatchController = class DispatchController {
    dispatch;
    constructor(dispatch) {
        this.dispatch = dispatch;
    }
    create(dto, user) {
        return this.dispatch.create({
            customerId: dto.customerId,
            driverId: dto.driverId,
            instructionNote: dto.instructionNote ?? null,
            actorUserId: user.userId,
            actorRole: user.role,
        });
    }
    listActive(limitRaw) {
        const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
        return this.dispatch.listActive({ limit });
    }
    reassign(id, dto, user) {
        return this.dispatch.reassign({
            dispatchId: id,
            newDriverId: dto.newDriverId,
            reason: dto.reason ?? null,
            actorUserId: user.userId,
            actorRole: user.role,
        });
    }
    listMine(user) {
        return this.dispatch.listForDriver(user.userId);
    }
    pollMine(user) {
        return this.dispatch.listForDriver(user.userId);
    }
    stream(user) {
        const subject = this.dispatch.subscribeDriverStream(user.userId);
        return subject.asObservable().pipe((0, operators_1.map)((payload) => ({
            type: payload.status === 'COMPLETED'
                ? 'dispatch.completed'
                : 'dispatch.created',
            data: payload,
        })), (0, operators_1.finalize)(() => {
            this.dispatch.unsubscribeDriverStream(user.userId, subject);
        }));
    }
};
exports.DispatchController = DispatchController;
__decorate([
    (0, common_1.Post)('call-center/dispatch'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.MANAGE_DISPATCH),
    (0, swagger_1.ApiOperation)({
        summary: 'Create a dispatch (call center → driver)',
        description: 'Strict semantics: status defaults to ASSIGNED, NO accept/reject, ' +
            'NO money fields. Refuses with 403 CUSTOMER_BLOCKED if the customer ' +
            'is currently blocked. The dispatch closes only when an Order with ' +
            'this dispatchId is created (auto-completion via order.created event).',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_dispatch_dto_1.CreateDispatchDto, Object]),
    __metadata("design:returntype", Promise)
], DispatchController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('call-center/dispatch/active'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.MANAGE_DISPATCH),
    (0, swagger_1.ApiOperation)({
        summary: 'List ACTIVE (ASSIGNED) dispatches for the call-center board',
    }),
    __param(0, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DispatchController.prototype, "listActive", null);
__decorate([
    (0, common_1.Post)('call-center/dispatch/:id/reassign'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.MANAGE_DISPATCH),
    (0, swagger_1.ApiOperation)({
        summary: 'Reassign an ASSIGNED dispatch to a new driver',
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, reassign_dispatch_dto_1.ReassignDispatchDto, Object]),
    __metadata("design:returntype", Promise)
], DispatchController.prototype, "reassign", null);
__decorate([
    (0, common_1.Get)('driver/dispatch/mine'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_DISPATCH),
    (0, swagger_1.ApiOperation)({
        summary: "Driver's own dispatch queue (read only — no accept/reject)",
        description: "Returns the driver's currently-assigned dispatches plus the most " +
            'recent COMPLETED ones (last hour) so the UI can show a "just closed" ' +
            'fade-out. The route is GUARANTEED safe for the driver UI to call ' +
            'on a polling interval as a fallback when SSE drops.',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DispatchController.prototype, "listMine", null);
__decorate([
    (0, common_1.Get)('driver/dispatch/mine/poll'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_DISPATCH),
    (0, swagger_1.ApiOperation)({
        summary: "Driver's dispatch queue (polling fallback for SSE drops)",
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DispatchController.prototype, "pollMine", null);
__decorate([
    (0, common_1.Sse)('driver/dispatch/stream'),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_DISPATCH),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'SSE feed of dispatch updates for the authenticated driver',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", rxjs_1.Observable)
], DispatchController.prototype, "stream", null);
exports.DispatchController = DispatchController = __decorate([
    (0, swagger_1.ApiTags)('dispatch'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [dispatch_service_1.DispatchService])
], DispatchController);
//# sourceMappingURL=dispatch.controller.js.map