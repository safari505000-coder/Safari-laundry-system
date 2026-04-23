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
exports.InvoiceAuditController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const invoice_audit_service_1 = require("./invoice-audit.service");
const edit_invoice_dto_1 = require("./dto/edit-invoice.dto");
const void_invoice_dto_1 = require("./dto/void-invoice.dto");
const list_audit_log_dto_1 = require("./dto/list-audit-log.dto");
const cc_performance_dto_1 = require("./dto/cc-performance.dto");
let InvoiceAuditController = class InvoiceAuditController {
    invoiceAudit;
    constructor(invoiceAudit) {
        this.invoiceAudit = invoiceAudit;
    }
    editInvoice(orderId, dto, user) {
        return this.invoiceAudit.editInvoice(orderId, user.userId, user.role, dto);
    }
    voidInvoice(orderId, dto, user) {
        return this.invoiceAudit.voidInvoice(orderId, user.userId, user.role, dto.reason);
    }
    listAuditLog(query) {
        return this.invoiceAudit.listAuditLog(query);
    }
    ccPerformance(query) {
        return this.invoiceAudit.getCcPerformance(query);
    }
};
exports.InvoiceAuditController = InvoiceAuditController;
__decorate([
    (0, common_1.Patch)('orders/:orderId'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: 'Same-day invoice edit by CC Supervisor',
        description: 'V19.9 — Patch totalPrice / posPaymentMethod / notes on a non-canceled order that was issued on the same Kuwait-local day. Writes an immutable InvoiceAuditLog row and posts GL reversal + re-post entries so the books stay balanced.',
    }),
    __param(0, (0, common_1.Param)('orderId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, edit_invoice_dto_1.EditInvoiceDto, Object]),
    __metadata("design:returntype", void 0)
], InvoiceAuditController.prototype, "editInvoice", null);
__decorate([
    (0, common_1.Post)('orders/:orderId/void'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.CALL_CENTER_SUPERVISOR, client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: 'Soft-void an invoice by CC Supervisor',
        description: 'V19.9 — Flip order.status → CANCELED, reverse the GL sale entry with a negative POS_SALE_COMPLETED row, and roll back the wallet (refund subscription balance or clear the debt slot). Writes an immutable InvoiceAuditLog row with the mandatory reason.',
    }),
    __param(0, (0, common_1.Param)('orderId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void_invoice_dto_1.VoidInvoiceDto, Object]),
    __metadata("design:returntype", void 0)
], InvoiceAuditController.prototype, "voidInvoice", null);
__decorate([
    (0, common_1.Get)('log'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.ACCOUNTANT),
    (0, swagger_1.ApiOperation)({
        summary: 'Invoice audit log — edits and voids',
        description: 'V19.9 — Owner / GM / Accountant paginated read of every supervisor edit and void with before/after snapshots, the actor, the mandatory void reason, and the financial impact in fils.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_audit_log_dto_1.ListAuditLogQueryDto]),
    __metadata("design:returntype", void 0)
], InvoiceAuditController.prototype, "listAuditLog", null);
__decorate([
    (0, common_1.Get)('cc-performance'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER, client_1.SafariRole.GENERAL_MANAGER, client_1.SafariRole.CALL_CENTER_SUPERVISOR),
    (0, swagger_1.ApiOperation)({
        summary: 'Per-agent Call-Center performance',
        description: 'V19.9 — For each CC agent (or supervisor) in the Kuwait-local date range: collections, debt settled, subscription activations, and distinct customers served. Defaults to today if `from`/`to` are omitted.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [cc_performance_dto_1.CcPerformanceQueryDto]),
    __metadata("design:returntype", void 0)
], InvoiceAuditController.prototype, "ccPerformance", null);
exports.InvoiceAuditController = InvoiceAuditController = __decorate([
    (0, swagger_1.ApiTags)('invoice-audit'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('invoice-audit'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [invoice_audit_service_1.InvoiceAuditService])
], InvoiceAuditController);
//# sourceMappingURL=invoice-audit.controller.js.map