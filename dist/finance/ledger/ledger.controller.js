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
exports.LedgerController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../../auth/decorators/roles.decorator");
const permissions_decorator_1 = require("../../auth/permissions/permissions.decorator");
const permissions_enum_1 = require("../../auth/permissions/permissions.enum");
const jwt_auth_guard_1 = require("../../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../../auth/guards/roles.guard");
const ledger_query_dto_1 = require("./dto/ledger-query.dto");
const ledger_response_dto_1 = require("./dto/ledger-response.dto");
const ledger_projection_service_1 = require("./ledger-projection.service");
const FINANCE_ROLES = [
    client_1.SafariRole.OWNER,
    client_1.SafariRole.GENERAL_MANAGER,
    client_1.SafariRole.ACCOUNTANT,
];
function resolveRange(q) {
    const fromIso = q.from ?? (0, ledger_query_dto_1.defaultFromIso)();
    const toIso = q.to ?? (0, ledger_query_dto_1.defaultToIso)();
    try {
        (0, ledger_query_dto_1.assertWithinMaxRange)(fromIso, toIso);
    }
    catch (e) {
        throw new common_1.BadRequestException(e instanceof Error ? e.message : 'Invalid date range');
    }
    return { fromIso, toIso };
}
function ensureFinanceRole(user) {
    if (!FINANCE_ROLES.includes(user.role)) {
        throw new common_1.ForbiddenException('Ledger endpoints are restricted to OWNER, GENERAL_MANAGER, and ACCOUNTANT.');
    }
}
let LedgerController = class LedgerController {
    projection;
    constructor(projection) {
        this.projection = projection;
    }
    async getSummary(user, q) {
        ensureFinanceRole(user);
        const { fromIso, toIso } = resolveRange(q);
        const entries = await this.projection.project({ fromIso, toIso });
        const accounts = this.projection.aggregateAccounts(entries);
        const recon = this.projection.reconcile(entries, fromIso, toIso);
        return {
            source: 'api/finance/ledger/summary',
            fromIso,
            toIso,
            totalEntries: recon.totalEntries,
            totalTransactions: recon.totalTransactions,
            globalDebit: recon.globalDebit,
            globalCredit: recon.globalCredit,
            accounts,
            generatedAt: recon.generatedAt,
        };
    }
    async getDriverAccount(user, driverId, q) {
        ensureFinanceRole(user);
        const { fromIso, toIso } = resolveRange(q);
        return this.accountView(`DRIVER_${driverId}`, fromIso, toIso);
    }
    async getManagerAccount(user, managerId, q) {
        ensureFinanceRole(user);
        const { fromIso, toIso } = resolveRange(q);
        return this.accountView(`MANAGER_${managerId}`, fromIso, toIso);
    }
    async getTransactions(user, q) {
        ensureFinanceRole(user);
        const { fromIso, toIso } = resolveRange(q);
        const all = await this.projection.project({ fromIso, toIso });
        const filtered = q.accountPrefix
            ? all.filter((e) => e.accountId.startsWith(q.accountPrefix))
            : all;
        const take = q.take ?? 200;
        const sliced = filtered.slice(0, take);
        return {
            source: 'api/finance/ledger/transactions',
            fromIso,
            toIso,
            totalEntries: filtered.length,
            entries: sliced,
            generatedAt: new Date().toISOString(),
        };
    }
    async getReconciliation(user, q) {
        ensureFinanceRole(user);
        const { fromIso, toIso } = resolveRange(q);
        const entries = await this.projection.project({ fromIso, toIso });
        const recon = this.projection.reconcile(entries, fromIso, toIso);
        return {
            source: 'api/finance/ledger/reconciliation',
            ...recon,
        };
    }
    async accountView(accountId, fromIso, toIso) {
        const all = await this.projection.project({ fromIso, toIso });
        const entries = all.filter((e) => e.accountId === accountId);
        const balanceList = this.projection.aggregateAccounts(entries);
        const balance = balanceList[0] ?? {
            accountId,
            totalDebit: '0.0000',
            totalCredit: '0.0000',
            balance: '0.0000',
            entryCount: 0,
        };
        return {
            source: 'api/finance/ledger/account',
            accountId,
            fromIso,
            toIso,
            balance,
            entries,
            generatedAt: new Date().toISOString(),
        };
    }
};
exports.LedgerController = LedgerController;
__decorate([
    (0, common_1.Get)('summary'),
    (0, swagger_1.ApiOkResponse)({ type: ledger_response_dto_1.LedgerSummaryResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ledger_query_dto_1.LedgerRangeQueryDto]),
    __metadata("design:returntype", Promise)
], LedgerController.prototype, "getSummary", null);
__decorate([
    (0, common_1.Get)('driver/:id'),
    (0, swagger_1.ApiOkResponse)({ type: ledger_response_dto_1.LedgerAccountResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, ledger_query_dto_1.LedgerRangeQueryDto]),
    __metadata("design:returntype", Promise)
], LedgerController.prototype, "getDriverAccount", null);
__decorate([
    (0, common_1.Get)('manager/:id'),
    (0, swagger_1.ApiOkResponse)({ type: ledger_response_dto_1.LedgerAccountResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, ledger_query_dto_1.LedgerRangeQueryDto]),
    __metadata("design:returntype", Promise)
], LedgerController.prototype, "getManagerAccount", null);
__decorate([
    (0, common_1.Get)('transactions'),
    (0, swagger_1.ApiOkResponse)({ type: ledger_response_dto_1.LedgerTransactionsResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ledger_query_dto_1.LedgerTransactionsQueryDto]),
    __metadata("design:returntype", Promise)
], LedgerController.prototype, "getTransactions", null);
__decorate([
    (0, common_1.Get)('reconciliation'),
    (0, swagger_1.ApiOkResponse)({ type: ledger_response_dto_1.LedgerReconciliationResponseDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ledger_query_dto_1.LedgerRangeQueryDto]),
    __metadata("design:returntype", Promise)
], LedgerController.prototype, "getReconciliation", null);
exports.LedgerController = LedgerController = __decorate([
    (0, swagger_1.ApiTags)('finance-ledger'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.Controller)('finance/ledger'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...FINANCE_ROLES),
    (0, permissions_decorator_1.Permissions)(permissions_enum_1.AppPermission.VIEW_FINANCIAL_REPORTS),
    __metadata("design:paramtypes", [ledger_projection_service_1.LedgerProjectionService])
], LedgerController);
//# sourceMappingURL=ledger.controller.js.map