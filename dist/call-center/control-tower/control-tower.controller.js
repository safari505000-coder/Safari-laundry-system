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
exports.ControlTowerController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../../auth/guards/roles.guard");
const control_tower_service_1 = require("./control-tower.service");
const control_tower_stream_service_1 = require("./control-tower-stream.service");
const control_tower_query_dto_1 = require("./dto/control-tower-query.dto");
const CONTROL_TOWER_ROLES = [
    client_1.SafariRole.CALL_CENTER,
    client_1.SafariRole.CALL_CENTER_SUPERVISOR,
    client_1.SafariRole.OWNER,
];
let ControlTowerController = class ControlTowerController {
    controlTower;
    streamService;
    constructor(controlTower, streamService) {
        this.controlTower = controlTower;
        this.streamService = streamService;
    }
    snapshot(query) {
        return this.controlTower.getSnapshot(query);
    }
    sse() {
        return this.streamService.subscribeFeed();
    }
};
exports.ControlTowerController = ControlTowerController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Control Tower dashboard snapshot',
        description: 'Read-only AR snapshot (`cashStatus=UNPAID`, `status≠CANCELED`), manual collection risk, active dispatch workload & SLA tiers (≥2m late / ≥5m escalated / ≥10m breached).',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [control_tower_query_dto_1.ControlTowerQueryDto]),
    __metadata("design:returntype", Promise)
], ControlTowerController.prototype, "snapshot", null);
__decorate([
    (0, common_1.Sse)('stream'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'SSE — Control Tower refresh hints',
        description: 'Named events: `control-tower:update` (payload JSON includes `kind`), `heartbeat` every ~12s. JWT via `?access_token=` or Authorization header on EventSource-capable clients.',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Function)
], ControlTowerController.prototype, "sse", null);
exports.ControlTowerController = ControlTowerController = __decorate([
    (0, swagger_1.ApiTags)('call-center.control-tower'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('call-center/control-tower'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...CONTROL_TOWER_ROLES),
    __metadata("design:paramtypes", [control_tower_service_1.ControlTowerService,
        control_tower_stream_service_1.ControlTowerStreamService])
], ControlTowerController);
//# sourceMappingURL=control-tower.controller.js.map