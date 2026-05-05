"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashIntelligenceModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../prisma/prisma.module");
const cash_intelligence_controller_1 = require("./cash-intelligence.controller");
const cash_intelligence_v2_service_1 = require("./cash-intelligence-v2.service");
let CashIntelligenceModule = class CashIntelligenceModule {
};
exports.CashIntelligenceModule = CashIntelligenceModule;
exports.CashIntelligenceModule = CashIntelligenceModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        controllers: [cash_intelligence_controller_1.CashIntelligenceController],
        providers: [cash_intelligence_v2_service_1.CashIntelligenceV2Service],
        exports: [cash_intelligence_v2_service_1.CashIntelligenceV2Service],
    })
], CashIntelligenceModule);
//# sourceMappingURL=cash-intelligence.module.js.map