"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const serve_static_1 = require("@nestjs/serve-static");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const attendance_module_1 = require("./attendance/attendance.module");
const audit_logs_module_1 = require("./audit-logs/audit-logs.module");
const auth_module_1 = require("./auth/auth.module");
const branches_module_1 = require("./branches/branches.module");
const call_center_module_1 = require("./call-center/call-center.module");
const commissions_module_1 = require("./commissions/commissions.module");
const debt_holds_module_1 = require("./debt-holds/debt-holds.module");
const invoice_audit_module_1 = require("./invoice-audit/invoice-audit.module");
const operating_hours_middleware_1 = require("./common/middleware/operating-hours.middleware");
const request_id_middleware_1 = require("./common/middleware/request-id.middleware");
const customers_module_1 = require("./customers/customers.module");
const debt_transfers_module_1 = require("./debt-transfers/debt-transfers.module");
const expenses_module_1 = require("./expenses/expenses.module");
const exports_module_1 = require("./exports/exports.module");
const fixed_expense_module_1 = require("./fixed-expenses/fixed-expense.module");
const payroll_module_1 = require("./payroll/payroll.module");
const finance_module_1 = require("./finance/finance.module");
const health_module_1 = require("./health/health.module");
const insights_module_1 = require("./insights/insights.module");
const inventory_module_1 = require("./inventory/inventory.module");
const purchase_orders_module_1 = require("./purchase-orders/purchase-orders.module");
const laundry_price_list_module_1 = require("./laundry-price-list/laundry-price-list.module");
const leaves_module_1 = require("./leaves/leaves.module");
const loans_module_1 = require("./loans/loans.module");
const manager_custody_module_1 = require("./manager-custody/manager-custody.module");
const driver_oversight_module_1 = require("./driver-oversight/driver-oversight.module");
const manager_documents_module_1 = require("./manager-documents/manager-documents.module");
const orders_module_1 = require("./orders/orders.module");
const payment_method_fees_module_1 = require("./payment-method-fees/payment-method-fees.module");
const payments_module_1 = require("./payments/payments.module");
const permissions_module_1 = require("./permissions/permissions.module");
const pos_module_1 = require("./pos/pos.module");
const prisma_module_1 = require("./prisma/prisma.module");
const safari_stream_module_1 = require("./safari-stream/safari-stream.module");
const reports_module_1 = require("./reports/reports.module");
const serials_module_1 = require("./serials/serials.module");
const shifts_module_1 = require("./shifts/shifts.module");
const system_module_1 = require("./system/system.module");
const system_settings_module_1 = require("./system-settings/system-settings.module");
const subscription_plans_module_1 = require("./subscription-plans/subscription-plans.module");
const subscribers_module_1 = require("./subscribers/subscribers.module");
const users_module_1 = require("./users/users.module");
const vehicle_expenses_module_1 = require("./vehicle-expenses/vehicle-expenses.module");
const verify_module_1 = require("./verify/verify.module");
const wallets_module_1 = require("./wallets/wallets.module");
const webDistPath = (0, node_path_1.join)(process.cwd(), 'web', 'dist');
const uploadsPath = (0, node_path_1.join)(process.cwd(), 'uploads');
const spaStaticModule = (0, node_fs_1.existsSync)(webDistPath)
    ? [
        serve_static_1.ServeStaticModule.forRoot({
            rootPath: webDistPath,
            exclude: ['/api/{*any}', '/docs/{*any}'],
        }),
    ]
    : [];
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(request_id_middleware_1.requestIdMiddleware, operating_hours_middleware_1.OperatingHoursMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            prisma_module_1.PrismaModule,
            permissions_module_1.PermissionsModule,
            finance_module_1.FinanceModule,
            auth_module_1.AuthModule,
            safari_stream_module_1.SafariStreamModule,
            users_module_1.UsersModule,
            reports_module_1.ReportsModule,
            payment_method_fees_module_1.PaymentMethodFeesModule,
            system_module_1.SystemModule,
            system_settings_module_1.SystemSettingsModule,
            commissions_module_1.CommissionsModule,
            debt_holds_module_1.DebtHoldsModule,
            expenses_module_1.ExpensesModule,
            exports_module_1.ExportsModule,
            payroll_module_1.PayrollModule,
            fixed_expense_module_1.FixedExpenseModule,
            orders_module_1.OrdersModule,
            payments_module_1.PaymentsModule,
            branches_module_1.BranchesModule,
            wallets_module_1.WalletsModule,
            audit_logs_module_1.AuditLogsModule,
            subscription_plans_module_1.SubscriptionPlansModule,
            subscribers_module_1.SubscribersModule,
            call_center_module_1.CallCenterModule,
            invoice_audit_module_1.InvoiceAuditModule,
            laundry_price_list_module_1.LaundryPriceListModule,
            inventory_module_1.InventoryModule,
            purchase_orders_module_1.PurchaseOrdersModule,
            insights_module_1.InsightsModule,
            manager_custody_module_1.ManagerCustodyModule,
            manager_documents_module_1.ManagerDocumentsModule,
            driver_oversight_module_1.DriverOversightModule,
            pos_module_1.PosModule,
            customers_module_1.CustomersModule,
            debt_transfers_module_1.DebtTransfersModule,
            serials_module_1.SerialsModule,
            shifts_module_1.ShiftsModule,
            attendance_module_1.AttendanceModule,
            leaves_module_1.LeavesModule,
            loans_module_1.LoansModule,
            vehicle_expenses_module_1.VehicleExpensesModule,
            verify_module_1.VerifyModule,
            health_module_1.HealthModule,
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: uploadsPath,
                serveRoot: '/uploads',
                serveStaticOptions: { index: false, fallthrough: true },
            }),
            ...spaStaticModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map