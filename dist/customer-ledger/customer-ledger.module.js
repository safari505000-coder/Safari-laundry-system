"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerLedgerModule = void 0;
const common_1 = require("@nestjs/common");
const general_ledger_module_1 = require("../general-ledger/general-ledger.module");
const inventory_module_1 = require("../inventory/inventory.module");
const prisma_module_1 = require("../prisma/prisma.module");
const customer_ledger_service_1 = require("./customer-ledger.service");
const prepaid_auto_reconcile_cron_1 = require("./prepaid-auto-reconcile.cron");
let CustomerLedgerModule = class CustomerLedgerModule {
};
exports.CustomerLedgerModule = CustomerLedgerModule;
exports.CustomerLedgerModule = CustomerLedgerModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, general_ledger_module_1.GeneralLedgerModule, inventory_module_1.InventoryModule],
        providers: [customer_ledger_service_1.CustomerLedgerService, prepaid_auto_reconcile_cron_1.PrepaidAutoReconcileCronService],
        exports: [customer_ledger_service_1.CustomerLedgerService],
    })
], CustomerLedgerModule);
//# sourceMappingURL=customer-ledger.module.js.map