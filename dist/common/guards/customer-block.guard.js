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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerBlockGuard = void 0;
const common_1 = require("@nestjs/common");
const customer_blocking_service_1 = require("../services/customer-blocking.service");
let CustomerBlockGuard = class CustomerBlockGuard {
    blocking;
    constructor(blocking) {
        this.blocking = blocking;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const customer = await this.blocking.findCustomerForRequest(req);
        if (!customer?.isBlocked) {
            return true;
        }
        const role = req.user?.role;
        const canOverride = this.blocking.canOverrideBlockedCustomer(role);
        if (!canOverride || !this.blocking.hasOverrideHeader(req)) {
            throw new common_1.ForbiddenException({
                message: 'CUSTOMER_BLOCKED',
                errorCode: 'CUSTOMER_BLOCKED',
                blockReason: customer.blockReason ?? 'غير محدد',
            });
        }
        await this.blocking.logBlockedOverride(req, customer);
        return true;
    }
};
exports.CustomerBlockGuard = CustomerBlockGuard;
exports.CustomerBlockGuard = CustomerBlockGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [customer_blocking_service_1.CustomerBlockingService])
], CustomerBlockGuard);
//# sourceMappingURL=customer-block.guard.js.map