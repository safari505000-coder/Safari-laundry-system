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
exports.CallCenterController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const branding_1 = require("../common/constants/branding");
const call_center_service_1 = require("./call-center.service");
const activate_subscription_dto_1 = require("./dto/activate-subscription.dto");
const extend_subscription_dto_1 = require("./dto/extend-subscription.dto");
const debt_recovery_report_dto_1 = require("./dto/debt-recovery-report.dto");
let CallCenterController = class CallCenterController {
    callCenterService;
    constructor(callCenterService) {
        this.callCenterService = callCenterService;
    }
    operationsSummary(branchId) {
        const raw = (branchId ?? '').trim();
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const scoped = raw && uuidRe.test(raw) ? raw : null;
        return this.callCenterService.getOperationsSummary(scoped);
    }
    debtRecoveryReport(q) {
        return this.callCenterService.getDebtRecoveryReport(q.from, q.to);
    }
    listPlans() {
        return this.callCenterService.listActiveSubscriptionPlans();
    }
    searchCustomers(q) {
        return this.callCenterService.searchCustomers(q ?? '');
    }
    activateSubscription(dto, user) {
        return this.callCenterService.activateSubscription(user.userId, dto);
    }
    extendSubscription(dto, user) {
        return this.callCenterService.extendSubscription(user.userId, dto);
    }
    markOrderReminderSent(orderId) {
        return this.callCenterService.sendOrderReminder(orderId);
    }
    ensureOrderPaymentLink(orderId) {
        return this.callCenterService.ensureOrderPaymentLink(orderId);
    }
    markSubscriberReminderSent(customerId) {
        return this.callCenterService.sendSubscriberReminder(customerId);
    }
    listSettlements(customerId) {
        return this.callCenterService.listCustomerSettlementHistory(customerId);
    }
};
exports.CallCenterController = CallCenterController;
__decorate([
    (0, common_1.Get)('operations-summary'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.CALL_CENTER, client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Call center operations summary — 3 KPIs (${branding_1.APP_BRAND})`,
        description: 'V1.6.1 — RED total market debt (Σ unpaid non-canceled orders), GREEN debt collected today strictly between Kuwait-local 00:00 and now (Σ metadata.debtSettled), YELLOW count of open UNPAID orders with a hosted payment URL awaiting action. Pass `?branchId=<uuid>` to scope every aggregate to a single branch (driver.branchId OR customer.originBranchId when driver-less); omit for global totals.',
    }),
    __param(0, (0, common_1.Query)('branchId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CallCenterController.prototype, "operationsSummary", null);
__decorate([
    (0, common_1.Get)('debt-recovery-report'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Debt recovery over time — owner reporting (${branding_1.APP_BRAND})`,
        description: 'OWNER only. Daily breakdown of debt-settled KWD (from ORDER_WALLET_SETTLEMENT + SUBSCRIPTION_ACTIVATION metadata.debtSettled). Defaults to last 30 days.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [debt_recovery_report_dto_1.DebtRecoveryQueryDto]),
    __metadata("design:returntype", void 0)
], CallCenterController.prototype, "debtRecoveryReport", null);
__decorate([
    (0, common_1.Get)('subscription-plans'),
    (0, swagger_1.ApiOperation)({
        summary: `List active subscription plans (${branding_1.APP_BRAND})`,
        description: 'CALL_CENTER only. Read-only catalog for activation (pay X → credit Y).',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CallCenterController.prototype, "listPlans", null);
__decorate([
    (0, common_1.Get)('customers'),
    (0, swagger_1.ApiOperation)({
        summary: `Search customers (${branding_1.APP_BRAND})`,
        description: 'CALL_CENTER only. Matches phone or address (case-insensitive), max 50 results.',
    }),
    __param(0, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CallCenterController.prototype, "searchCustomers", null);
__decorate([
    (0, common_1.Post)('subscriptions/activate'),
    (0, swagger_1.ApiOperation)({
        summary: `Activate subscription for customer (${branding_1.APP_BRAND})`,
        description: 'CALL_CENTER only. Collected plan price is applied to customer debt first (automatic settlement), then the remainder of the plan credit increases prepaid balance. All wallet updates run inside this transaction — no bypass.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [activate_subscription_dto_1.ActivateSubscriptionDto, Object]),
    __metadata("design:returntype", void 0)
], CallCenterController.prototype, "activateSubscription", null);
__decorate([
    (0, common_1.Post)('subscriptions/extend'),
    (0, swagger_1.ApiOperation)({
        summary: `Extend an active subscription by N days (${branding_1.APP_BRAND})`,
        description: 'Dastur V1.5.3 — Management Room "Extend Subscription". Pushes subscriptionExpiresAt forward by extensionDays (1..365) on the SAME plan. Does not touch wallet balance/debt. Audited via a SUBSCRIPTION_ACTIVATION row with amount=0 and metadata.extensionOnly=true.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [extend_subscription_dto_1.ExtendSubscriptionDto, Object]),
    __metadata("design:returntype", void 0)
], CallCenterController.prototype, "extendSubscription", null);
__decorate([
    (0, common_1.Post)('orders/:orderId/reminder'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.CALL_CENTER, client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Mark a collection reminder as sent (${branding_1.APP_BRAND})`,
        description: 'Dastur §5 (V1.5). Atomic 24h-guarded reminder counter bump for an order. Returns `{sent:true}` when the counter was incremented, or `{sent:false, nextAllowedAtIso}` when the 24h cooldown is still active.',
    }),
    __param(0, (0, common_1.Param)('orderId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CallCenterController.prototype, "markOrderReminderSent", null);
__decorate([
    (0, common_1.Post)('orders/:orderId/payment-link'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.CALL_CENTER),
    (0, swagger_1.ApiOperation)({
        summary: `Ensure a hosted payment link exists for an unpaid order (${branding_1.APP_BRAND})`,
        description: 'V1.6.0 — CALL_CENTER only. Returns the existing hosted-checkout URL if one was already minted, otherwise calls the gateway and persists a new link on the order. Works for ANY unpaid non-canceled order regardless of original payment method (Cash, KNET, DEBT_ON_ACCOUNT, PAYMENT_LINK, ONLINE). When the gateway callback later confirms payment, the order auto-switches to `posPaymentMethod=ONLINE` and the ledger row is tagged `debtSettlementViaLink=true` with `originalPaymentMethod` preserved for Accountant reports.',
    }),
    __param(0, (0, common_1.Param)('orderId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CallCenterController.prototype, "ensureOrderPaymentLink", null);
__decorate([
    (0, common_1.Post)('subscribers/:customerId/reminder'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.CALL_CENTER, client_1.SafariRole.OWNER),
    (0, swagger_1.ApiOperation)({
        summary: `Mark a subscription renewal reminder as sent (${branding_1.APP_BRAND})`,
        description: 'Dastur §5 (V1.5). Atomic 24h-guarded reminder counter bump for a subscriber. Counter lives on CustomerWallet; wallet is created lazily on first reminder.',
    }),
    __param(0, (0, common_1.Param)('customerId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CallCenterController.prototype, "markSubscriberReminderSent", null);
__decorate([
    (0, common_1.Get)('customers/:customerId/settlements'),
    (0, swagger_1.ApiOperation)({
        summary: `Customer settlement history (${branding_1.APP_BRAND})`,
        description: 'CALL_CENTER only. Recent subscription activations and order wallet settlements with debt/balance breakdown when recorded.',
    }),
    __param(0, (0, common_1.Param)('customerId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CallCenterController.prototype, "listSettlements", null);
exports.CallCenterController = CallCenterController = __decorate([
    (0, swagger_1.ApiTags)('call-center'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('call-center'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.CALL_CENTER),
    __metadata("design:paramtypes", [call_center_service_1.CallCenterService])
], CallCenterController);
//# sourceMappingURL=call-center.controller.js.map