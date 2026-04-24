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
exports.PublicFeedbackController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const submit_feedback_dto_1 = require("./dto/submit-feedback.dto");
const feedback_service_1 = require("./feedback.service");
let PublicFeedbackController = class PublicFeedbackController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    get(orderId) {
        return this.svc.publicGetOrder(orderId);
    }
    submit(orderId, dto, ip) {
        return this.svc.submitFeedback(orderId, dto, ip ?? null);
    }
};
exports.PublicFeedbackController = PublicFeedbackController;
__decorate([
    (0, common_1.Get)(':orderId'),
    (0, swagger_1.ApiOperation)({
        summary: 'Public invoice summary for the QR rating page',
        description: 'V19.22 — returns the subset of the order visible on the paper receipt plus any existing rating the customer has already left. 404 is returned uniformly when the order does not exist so URL-harvesters cannot enumerate.',
    }),
    __param(0, (0, common_1.Param)('orderId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PublicFeedbackController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(':orderId/feedback'),
    (0, swagger_1.ApiOperation)({
        summary: 'Submit (or update) a QR-page rating + note',
        description: 'V19.22 — idempotent upsert: the first submission creates the row, subsequent submissions from the same order overwrite and reset the acknowledged flag so the Owner / GM dashboard re-surfaces the update.',
    }),
    __param(0, (0, common_1.Param)('orderId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, submit_feedback_dto_1.SubmitFeedbackDto, String]),
    __metadata("design:returntype", void 0)
], PublicFeedbackController.prototype, "submit", null);
exports.PublicFeedbackController = PublicFeedbackController = __decorate([
    (0, swagger_1.ApiTags)('public-feedback'),
    (0, common_1.Controller)('public/orders'),
    __metadata("design:paramtypes", [feedback_service_1.FeedbackService])
], PublicFeedbackController);
//# sourceMappingURL=public-feedback.controller.js.map