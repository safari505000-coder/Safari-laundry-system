"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogsModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const discord_alerts_module_1 = require("../common/services/discord-alerts.module");
const prisma_module_1 = require("../prisma/prisma.module");
const audit_integrity_cron_1 = require("./audit-integrity.cron");
const audit_logs_controller_1 = require("./audit-logs.controller");
const audit_logs_service_1 = require("./audit-logs.service");
const audit_security_guard_1 = require("./audit-security.guard");
const security_state_service_1 = require("./security-state.service");
let AuditLogsModule = class AuditLogsModule {
};
exports.AuditLogsModule = AuditLogsModule;
exports.AuditLogsModule = AuditLogsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, discord_alerts_module_1.DiscordAlertsModule],
        controllers: [audit_logs_controller_1.AuditLogsController],
        providers: [
            audit_logs_service_1.AuditLogsService,
            security_state_service_1.SecurityStateService,
            audit_integrity_cron_1.AuditIntegrityCron,
            {
                provide: core_1.APP_GUARD,
                useClass: audit_security_guard_1.AuditSecurityGuard,
            },
        ],
        exports: [audit_logs_service_1.AuditLogsService, security_state_service_1.SecurityStateService],
    })
], AuditLogsModule);
//# sourceMappingURL=audit-logs.module.js.map