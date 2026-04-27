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
exports.CustomersService = void 0;
const common_1 = require("@nestjs/common");
const debt_service_1 = require("../finance/services/debt.service");
const subscription_service_1 = require("../finance/services/subscription.service");
const customer_core_service_1 = require("./customer-core.service");
let CustomersService = class CustomersService {
    core;
    debt;
    subscription;
    constructor(core, debt, subscription) {
        this.core = core;
        this.debt = debt;
        this.subscription = subscription;
    }
    async list(query) {
        const q = (query ?? '').trim();
        const isNumeric = /^[0-9]+$/.test(q);
        const customers = isNumeric && q.length >= 2
            ? await this.core.listByPhonePriority(q)
            : await this.core.list(q);
        const snapshots = await Promise.all(customers.map(async (customer) => {
            const [debt, subscription] = await Promise.all([
                this.debt.getCustomerDebtSnapshot(customer.id),
                this.subscription.getCustomerSubscriptionSnapshot(customer.id),
            ]);
            return {
                customer,
                debt,
                subscription,
            };
        }));
        return snapshots;
    }
    async update(id, dto) {
        return this.core.update(id, dto);
    }
    async resolveIncomingPhone(raw) {
        const rows = await this.core.findByIncomingPhoneRaw(raw);
        const hintTerms = this.core.incomingPhoneSearchTerms(raw);
        const searchHint = hintTerms.sort((a, b) => b.length - a.length)[0] ?? '';
        if (rows.length === 0) {
            return { customer: null, ambiguous: false, searchHint };
        }
        const seen = new Map();
        for (const r of rows) {
            seen.set(r.id, r);
        }
        const unique = [...seen.values()];
        if (unique.length === 1) {
            return { customer: unique[0], ambiguous: false, searchHint };
        }
        return { customer: null, ambiguous: true, searchHint };
    }
    async createQuick(dto) {
        return this.core.createQuickCustomer(dto.displayName, dto.phone);
    }
    async getProfileWithFinancials(customerId) {
        const customer = await this.core.getById(customerId);
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const [debt, subscription] = await Promise.all([
            this.debt.getCustomerDebtSnapshot(customerId),
            this.subscription.getCustomerSubscriptionSnapshot(customerId),
        ]);
        return { customer, debt, subscription };
    }
};
exports.CustomersService = CustomersService;
exports.CustomersService = CustomersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [customer_core_service_1.CustomerCoreService,
        debt_service_1.DebtService,
        subscription_service_1.SubscriptionService])
], CustomersService);
//# sourceMappingURL=customers.service.js.map