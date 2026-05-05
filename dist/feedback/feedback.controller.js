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
exports.FeedbackController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const feedback_service_1 = require("./feedback.service");
let FeedbackController = class FeedbackController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    list(onlyUnreadRaw, minRatingRaw, maxRatingRaw, takeRaw, skipRaw) {
        const onlyUnread = onlyUnreadRaw === 'true' || onlyUnreadRaw === '1';
        const minRating = minRatingRaw ? Number.parseInt(minRatingRaw, 10) : undefined;
        const maxRating = maxRatingRaw ? Number.parseInt(maxRatingRaw, 10) : undefined;
        const take = takeRaw ? Number.parseInt(takeRaw, 10) : undefined;
        const skip = skipRaw ? Number.parseInt(skipRaw, 10) : undefined;
        return this.svc.listFeedback({ onlyUnread, minRating, maxRating, take, skip });
    }
    acknowledge(id, user) {
        return this.svc.acknowledge(id, user.userId);
    }
};
exports.FeedbackController = FeedbackController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR),
    (0, swagger_1.ApiOperation)({ summary: 'List customer feedback (paged) with summary stats' }),
    __param(0, (0, common_1.Query)('onlyUnread')),
    __param(1, (0, common_1.Query)('minRating')),
    __param(2, (0, common_1.Query)('maxRating')),
    __param(3, (0, common_1.Query)('take')),
    __param(4, (0, common_1.Query)('skip')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], FeedbackController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)(':id/acknowledge'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.CALL_CENTER, client_1.SafariRole.CALL_CENTER_SUPERVISOR),
    (0, swagger_1.ApiOperation)({ summary: 'Mark a feedback row as seen / addressed' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], FeedbackController.prototype, "acknowledge", null);
exports.FeedbackController = FeedbackController = __decorate([
    (0, swagger_1.ApiTags)('feedback'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('feedback'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [feedback_service_1.FeedbackService])
], FeedbackController);
void common_1.ParseBoolPipe;
void common_1.ParseIntPipe;
//# sourceMappingURL=feedback.controller.js.map