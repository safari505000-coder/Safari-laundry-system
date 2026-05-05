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
var SystemSettingsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemSettingsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let SystemSettingsService = class SystemSettingsService {
    static { SystemSettingsService_1 = this; }
    prisma;
    static POLICY_ID = 'singleton';
    constructor(prisma) {
        this.prisma = prisma;
    }
    assertCanViewSettings(role) {
        if (role !== client_1.SafariRole.OWNER && role !== client_1.SafariRole.GENERAL_MANAGER) {
            throw new common_1.ForbiddenException();
        }
    }
    assertOwnerWrites(role) {
        if (role !== client_1.SafariRole.OWNER) {
            throw new common_1.ForbiddenException();
        }
    }
    async listToggles(actorRole) {
        this.assertCanViewSettings(actorRole);
        const rows = await this.prisma.systemToggle.findMany();
        const byKey = new Map(rows.map((r) => [r.key, r]));
        return Object.values(client_1.SystemToggleKey).map((key) => {
            const row = byKey.get(key);
            return {
                key,
                isEnabled: row?.isEnabled ?? true,
                updatedAt: row?.updatedAt ?? null,
                updatedBy: row?.updatedBy ?? null,
            };
        });
    }
    async setToggle(actorRole, actorUserId, key, isEnabled) {
        this.assertOwnerWrites(actorRole);
        return this.prisma.systemToggle.upsert({
            where: { key },
            create: { key, isEnabled, updatedBy: actorUserId },
            update: { isEnabled, updatedBy: actorUserId },
        });
    }
    async isEnabled(key) {
        const row = await this.prisma.systemToggle.findUnique({ where: { key } });
        return row?.isEnabled ?? true;
    }
    async getDebtHoldPolicy() {
        const row = await this.prisma.debtHoldPolicy.findUnique({
            where: { id: SystemSettingsService_1.POLICY_ID },
        });
        if (row)
            return row;
        return this.prisma.debtHoldPolicy.create({
            data: {
                id: SystemSettingsService_1.POLICY_ID,
                isActive: false,
                holdMode: client_1.DebtHoldMode.FULL,
            },
        });
    }
    async updateDebtHoldPolicy(actorRole, dto) {
        this.assertOwnerWrites(actorRole);
        if (dto.holdMode === client_1.DebtHoldMode.FIXED && dto.fixedAmount == null) {
            throw new common_1.BadRequestException('fixedAmount is required when holdMode = FIXED');
        }
        const fixed = dto.holdMode === client_1.DebtHoldMode.FIXED && dto.fixedAmount != null
            ? new client_1.Prisma.Decimal(dto.fixedAmount.toFixed(4))
            : null;
        return this.prisma.debtHoldPolicy.upsert({
            where: { id: SystemSettingsService_1.POLICY_ID },
            create: {
                id: SystemSettingsService_1.POLICY_ID,
                isActive: dto.isActive,
                holdMode: dto.holdMode,
                fixedAmount: fixed,
            },
            update: {
                isActive: dto.isActive,
                holdMode: dto.holdMode,
                fixedAmount: fixed,
            },
        });
    }
    async getPayrollSettings() {
        const row = await this.prisma.payrollSettings.findUnique({
            where: { id: SystemSettingsService_1.POLICY_ID },
        });
        if (row)
            return row;
        return this.prisma.payrollSettings.create({
            data: {
                id: SystemSettingsService_1.POLICY_ID,
                payDayOfMonth: 1,
                autoDeductLoans: true,
                linkWithAttendance: false,
            },
        });
    }
    async updatePayrollSettings(actorRole, dto) {
        this.assertOwnerWrites(actorRole);
        if (!Number.isInteger(dto.payDayOfMonth) ||
            dto.payDayOfMonth < 1 ||
            dto.payDayOfMonth > 28) {
            throw new common_1.BadRequestException('payDayOfMonth must be between 1 and 28');
        }
        return this.prisma.payrollSettings.upsert({
            where: { id: SystemSettingsService_1.POLICY_ID },
            create: {
                id: SystemSettingsService_1.POLICY_ID,
                payDayOfMonth: dto.payDayOfMonth,
                autoDeductLoans: dto.autoDeductLoans,
                linkWithAttendance: dto.linkWithAttendance,
            },
            update: {
                payDayOfMonth: dto.payDayOfMonth,
                autoDeductLoans: dto.autoDeductLoans,
                linkWithAttendance: dto.linkWithAttendance,
            },
        });
    }
};
exports.SystemSettingsService = SystemSettingsService;
exports.SystemSettingsService = SystemSettingsService = SystemSettingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SystemSettingsService);
//# sourceMappingURL=system-settings.service.js.map