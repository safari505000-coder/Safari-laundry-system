"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JournalController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const double_entry_journal_service_1 = require("../general-ledger/double-entry-journal.service");
const debt_service_1 = require("./services/debt.service");
let JournalController = class JournalController {
    journal;
    debt;
    constructor(journal, debt) {
        this.journal = journal;
        this.debt = debt;
    }
    async getCustomerBalance(customerId) {
        const balance = await this.journal.getCustomerBalanceFromJournal(customerId);
        const ledger = await this.debt.getCustomerNetDebtFromDebtLedger(customerId);
        await this.journal.logCustomerDrift(customerId, ledger.netOpenDebtKd);
        return {
            customerId,
            journalBalanceKd: balance.toFixed(4),
            ledgerBalanceKd: ledger.netOpenDebtKd.toFixed(4),
            computedAt: new Date().toISOString(),
        };
    }
    getCustomerStatement(customerId) {
        return this.journal.getCustomerStatement(customerId);
    }
};
exports.JournalController = JournalController;
__decorate([
    (0, common_1.Get)('customers/:customerId/balance'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.CALL_CENTER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({ summary: 'Journal AR balance for one customer' }),
    __param(0, (0, common_1.Param)('customerId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], JournalController.prototype, "getCustomerBalance", null);
__decorate([
    (0, common_1.Get)('customers/:customerId/statement'),
    (0, roles_decorator_1.Roles)(client_1.SafariRole.CALL_CENTER, client_1.SafariRole.ACCOUNTANT, client_1.SafariRole.GENERAL_MANAGER),
    (0, swagger_1.ApiOperation)({ summary: 'Journal-based customer AR statement' }),
    __param(0, (0, common_1.Param)('customerId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], JournalController.prototype, "getCustomerStatement", null);
exports.JournalController = JournalController = __decorate([
    (0, swagger_1.ApiTags)('finance-journal'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('finance/journal'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [double_entry_journal_service_1.DoubleEntryJournalService,
        debt_service_1.DebtService])
], JournalController);
//# sourceMappingURL=journal.controller.js.map