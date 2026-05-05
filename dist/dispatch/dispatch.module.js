"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchModule = void 0;
const common_1 = require("@nestjs/common");
const audit_logs_module_1 = require("../audit-logs/audit-logs.module");
const prisma_module_1 = require("../prisma/prisma.module");
const dispatch_controller_1 = require("./dispatch.controller");
const dispatch_escalation_job_1 = require("./dispatch.escalation.job");
const dispatch_reconciliation_job_1 = require("./dispatch.reconciliation.job");
const dispatch_service_1 = require("./dispatch.service");
let DispatchModule = class DispatchModule {
};
exports.DispatchModule = DispatchModule;
exports.DispatchModule = DispatchModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, audit_logs_module_1.AuditLogsModule],
        controllers: [dispatch_controller_1.DispatchController],
        providers: [
            dispatch_service_1.DispatchService,
            dispatch_escalation_job_1.DispatchEscalationJob,
            dispatch_reconciliation_job_1.DispatchReconciliationJob,
        ],
        exports: [dispatch_service_1.DispatchService],
    })
], DispatchModule);
//# sourceMappingURL=dispatch.module.js.map