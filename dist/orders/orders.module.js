"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const customer_ledger_module_1 = require("../customer-ledger/customer-ledger.module");
const general_ledger_module_1 = require("../general-ledger/general-ledger.module");
const customer_notifications_module_1 = require("../customer-notifications/customer-notifications.module");
const inventory_module_1 = require("../inventory/inventory.module");
const payments_module_1 = require("../payments/payments.module");
const serials_module_1 = require("../serials/serials.module");
const orders_controller_1 = require("./orders.controller");
const public_invoice_controller_1 = require("./public-invoice.controller");
const orders_service_1 = require("./orders.service");
const stale_quick_orders_cron_1 = require("./stale-quick-orders.cron");
let OrdersModule = class OrdersModule {
};
exports.OrdersModule = OrdersModule;
exports.OrdersModule = OrdersModule = __decorate([
    (0, common_1.Module)({
        imports: [
            (0, common_1.forwardRef)(() => auth_module_1.AuthModule),
            (0, common_1.forwardRef)(() => customer_ledger_module_1.CustomerLedgerModule),
            general_ledger_module_1.GeneralLedgerModule,
            (0, common_1.forwardRef)(() => payments_module_1.PaymentsModule),
            customer_notifications_module_1.CustomerNotificationsModule,
            serials_module_1.SerialsModule,
            inventory_module_1.InventoryModule,
        ],
        controllers: [orders_controller_1.OrdersController, public_invoice_controller_1.PublicInvoiceController],
        providers: [orders_service_1.OrdersService, stale_quick_orders_cron_1.StaleQuickOrdersCronService],
        exports: [orders_service_1.OrdersService],
    })
], OrdersModule);
//# sourceMappingURL=orders.module.js.map