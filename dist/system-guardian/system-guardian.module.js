"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemGuardianModule = void 0;
const common_1 = require("@nestjs/common");
const cash_monitor_module_1 = require("../cash-monitor/cash-monitor.module");
const system_config_module_1 = require("../system-config/system-config.module");
const system_guardian_controller_1 = require("./system-guardian.controller");
const system_guardian_service_1 = require("./system-guardian.service");
const owner_alert_notifier_service_1 = require("./owner-alert-notifier.service");
let SystemGuardianModule = class SystemGuardianModule {
};
exports.SystemGuardianModule = SystemGuardianModule;
exports.SystemGuardianModule = SystemGuardianModule = __decorate([
    (0, common_1.Module)({
        imports: [cash_monitor_module_1.CashMonitorModule, system_config_module_1.SystemConfigModule],
        controllers: [system_guardian_controller_1.SystemGuardianController],
        providers: [system_guardian_service_1.SystemGuardianService, owner_alert_notifier_service_1.OwnerAlertNotifierService],
        exports: [system_guardian_service_1.SystemGuardianService],
    })
], SystemGuardianModule);
//# sourceMappingURL=system-guardian.module.js.map