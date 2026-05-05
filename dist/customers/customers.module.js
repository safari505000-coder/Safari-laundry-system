"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersModule = void 0;
const common_1 = require("@nestjs/common");
const finance_module_1 = require("../finance/finance.module");
const customer_blocking_service_1 = require("../common/services/customer-blocking.service");
const customer_core_service_1 = require("./customer-core.service");
const customers_controller_1 = require("./customers.controller");
const customers_service_1 = require("./customers.service");
const customer_360_service_1 = require("./customer-360.service");
let CustomersModule = class CustomersModule {
};
exports.CustomersModule = CustomersModule;
exports.CustomersModule = CustomersModule = __decorate([
    (0, common_1.Module)({
        imports: [finance_module_1.FinanceModule],
        controllers: [customers_controller_1.CustomersController],
        providers: [
            customers_service_1.CustomersService,
            customer_core_service_1.CustomerCoreService,
            customer_360_service_1.Customer360Service,
            customer_blocking_service_1.CustomerBlockingService,
        ],
    })
], CustomersModule);
//# sourceMappingURL=customers.module.js.map