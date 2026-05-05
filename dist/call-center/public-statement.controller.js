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
exports.PublicStatementController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const call_center_service_1 = require("./call-center.service");
let PublicStatementController = class PublicStatementController {
    callCenter;
    constructor(callCenter) {
        this.callCenter = callCenter;
    }
    getPublic(token) {
        return this.callCenter.getPublicStatement(token);
    }
};
exports.PublicStatementController = PublicStatementController;
__decorate([
    (0, common_1.Get)(':token'),
    (0, swagger_1.ApiOperation)({
        summary: 'Read a shared customer statement by signed token',
        description: 'V19.8.9 — validates the JWT, re-scopes the request to the embedded customer, and returns the same CustomerLedgerResponseDto the authenticated endpoint returns. No auth header required. Throws 404 on expired / malformed / wrong-purpose tokens.',
    }),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PublicStatementController.prototype, "getPublic", null);
exports.PublicStatementController = PublicStatementController = __decorate([
    (0, swagger_1.ApiTags)('public-statement'),
    (0, common_1.Controller)('public/statement'),
    (0, roles_decorator_1.Public)('Signed statement-share token scopes access without a staff JWT.'),
    __metadata("design:paramtypes", [call_center_service_1.CallCenterService])
], PublicStatementController);
//# sourceMappingURL=public-statement.controller.js.map