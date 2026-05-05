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
exports.PublicInvoiceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const orders_service_1 = require("./orders.service");
let PublicInvoiceController = class PublicInvoiceController {
    orders;
    constructor(orders) {
        this.orders = orders;
    }
    async getPdfByQuery(token, res) {
        if (token == null || !String(token).trim()) {
            throw new common_1.BadRequestException('Missing required query: token');
        }
        return this.servePublicInvoicePdf(String(token), res);
    }
    async getPdfByParam(token, res) {
        return this.servePublicInvoicePdf(token, res);
    }
    async servePublicInvoicePdf(token, res) {
        const { stream, filename } = await this.orders.getPublicInvoicePdfStream(token);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return new common_1.StreamableFile(stream, {
            type: 'application/pdf',
            disposition: `attachment; filename="${filename}"`,
        });
    }
    get(token) {
        return this.orders.getOrderForPublicInvoiceToken(token);
    }
};
exports.PublicInvoiceController = PublicInvoiceController;
__decorate([
    (0, common_1.Get)('pdf'),
    (0, common_1.Header)('Cache-Control', 'no-store, no-cache, must-revalidate, private'),
    (0, common_1.Header)('Pragma', 'no-cache'),
    (0, swagger_1.ApiProduces)('application/pdf'),
    (0, swagger_1.ApiOperation)({
        summary: 'Download invoice PDF (token in query string)',
        description: 'Same JWT as `GET /:token` / `GET pdf/:token`. Use when the token is long or path-based URLs are altered by a proxy.',
    }),
    __param(0, (0, common_1.Query)('token')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PublicInvoiceController.prototype, "getPdfByQuery", null);
__decorate([
    (0, common_1.Get)('pdf/:token'),
    (0, common_1.Header)('Cache-Control', 'no-store, no-cache, must-revalidate, private'),
    (0, common_1.Header)('Pragma', 'no-cache'),
    (0, swagger_1.ApiProduces)('application/pdf'),
    (0, swagger_1.ApiOperation)({
        summary: 'Download shared invoice as PDF (token in path)',
        description: 'V19.27 — Same JWT as `GET /:token` but returns `application/pdf` for Moatmt `media_url` fetches.',
    }),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PublicInvoiceController.prototype, "getPdfByParam", null);
__decorate([
    (0, common_1.Get)(':token'),
    (0, swagger_1.ApiOperation)({
        summary: 'Load a shared invoice receipt for customer PDF save',
        description: 'Validates the JWT, returns the same order detail shape as GET /api/orders/:id for receipt rendering.',
    }),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PublicInvoiceController.prototype, "get", null);
exports.PublicInvoiceController = PublicInvoiceController = __decorate([
    (0, swagger_1.ApiTags)('public-invoice'),
    (0, common_1.Controller)('public/invoice'),
    (0, roles_decorator_1.Public)('Signed invoice-share token scopes public receipt/PDF access.'),
    __metadata("design:paramtypes", [orders_service_1.OrdersService])
], PublicInvoiceController);
//# sourceMappingURL=public-invoice.controller.js.map