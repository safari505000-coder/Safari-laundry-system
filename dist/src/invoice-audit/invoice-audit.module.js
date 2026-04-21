"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceAuditModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const general_ledger_module_1 = require("../general-ledger/general-ledger.module");
const prisma_module_1 = require("../prisma/prisma.module");
const invoice_audit_controller_1 = require("./invoice-audit.controller");
const invoice_audit_service_1 = require("./invoice-audit.service");
let InvoiceAuditModule = class InvoiceAuditModule {
};
exports.InvoiceAuditModule = InvoiceAuditModule;
exports.InvoiceAuditModule = InvoiceAuditModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, auth_module_1.AuthModule, general_ledger_module_1.GeneralLedgerModule],
        controllers: [invoice_audit_controller_1.InvoiceAuditController],
        providers: [invoice_audit_service_1.InvoiceAuditService],
        exports: [invoice_audit_service_1.InvoiceAuditService],
    })
], InvoiceAuditModule);
//# sourceMappingURL=invoice-audit.module.js.map