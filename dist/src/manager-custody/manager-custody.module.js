"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManagerCustodyModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const general_ledger_module_1 = require("../general-ledger/general-ledger.module");
const prisma_module_1 = require("../prisma/prisma.module");
const manager_custody_controller_1 = require("./manager-custody.controller");
const manager_custody_service_1 = require("./manager-custody.service");
let ManagerCustodyModule = class ManagerCustodyModule {
};
exports.ManagerCustodyModule = ManagerCustodyModule;
exports.ManagerCustodyModule = ManagerCustodyModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, auth_module_1.AuthModule, general_ledger_module_1.GeneralLedgerModule],
        controllers: [manager_custody_controller_1.ManagerCustodyController],
        providers: [manager_custody_service_1.ManagerCustodyService],
        exports: [manager_custody_service_1.ManagerCustodyService],
    })
], ManagerCustodyModule);
//# sourceMappingURL=manager-custody.module.js.map