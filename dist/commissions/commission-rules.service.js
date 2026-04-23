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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommissionRulesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let CommissionRulesService = class CommissionRulesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    assertOwnerOrGM(role) {
        if (role !== client_1.SafariRole.OWNER && role !== client_1.SafariRole.GENERAL_MANAGER) {
            throw new common_1.ForbiddenException();
        }
    }
    async list(actorRole, opts) {
        this.assertOwnerOrGM(actorRole);
        return this.prisma.commissionRule.findMany({
            where: opts?.mode ? { mode: opts.mode } : {},
            orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
        });
    }
    async findOne(actorRole, id) {
        this.assertOwnerOrGM(actorRole);
        const row = await this.prisma.commissionRule.findUnique({ where: { id } });
        if (!row)
            throw new common_1.NotFoundException('Commission rule not found');
        return row;
    }
    async create(actorRole, dto) {
        this.assertOwnerOrGM(actorRole);
        return this.prisma.commissionRule.create({
            data: {
                name: dto.name,
                isActive: dto.isActive ?? true,
                role: dto.role ?? null,
                mode: dto.mode,
                calculationBase: dto.calculationBase ?? 'ORDER_TOTAL',
                percentage: new client_1.Prisma.Decimal(dto.percentage.toFixed(4)),
                minInvoiceAmount: new client_1.Prisma.Decimal((dto.minInvoiceAmount ?? 0).toFixed(4)),
                payoutTiming: dto.payoutTiming ?? 'IMMEDIATE',
                linkedToDebt: dto.linkedToDebt ?? false,
            },
        });
    }
    async update(actorRole, id, dto) {
        this.assertOwnerOrGM(actorRole);
        await this.findOne(actorRole, id);
        const data = {};
        if (dto.name !== undefined)
            data.name = dto.name;
        if (dto.isActive !== undefined)
            data.isActive = dto.isActive;
        if (dto.role !== undefined)
            data.role = dto.role ?? null;
        if (dto.mode !== undefined)
            data.mode = dto.mode;
        if (dto.calculationBase !== undefined)
            data.calculationBase = dto.calculationBase;
        if (dto.percentage !== undefined)
            data.percentage = new client_1.Prisma.Decimal(dto.percentage.toFixed(4));
        if (dto.minInvoiceAmount !== undefined)
            data.minInvoiceAmount = new client_1.Prisma.Decimal(dto.minInvoiceAmount.toFixed(4));
        if (dto.payoutTiming !== undefined)
            data.payoutTiming = dto.payoutTiming;
        if (dto.linkedToDebt !== undefined)
            data.linkedToDebt = dto.linkedToDebt;
        return this.prisma.commissionRule.update({ where: { id }, data });
    }
    async remove(actorRole, id) {
        this.assertOwnerOrGM(actorRole);
        await this.findOne(actorRole, id);
        return this.prisma.commissionRule.update({
            where: { id },
            data: { isActive: false },
        });
    }
    async getDefaultRule(actorRole) {
        this.assertOwnerOrGM(actorRole);
        return this.prisma.commissionRule.findFirst({
            where: { role: null },
            orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
        });
    }
    async upsertDefaultRule(actorRole, dto) {
        this.assertOwnerOrGM(actorRole);
        const existing = await this.prisma.commissionRule.findFirst({
            where: { role: null },
            orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
        });
        const data = {
            name: dto.name || 'القاعدة الافتراضية',
            isActive: dto.isActive ?? true,
            role: null,
            mode: dto.mode,
            calculationBase: dto.calculationBase ?? 'ORDER_TOTAL',
            percentage: new client_1.Prisma.Decimal(dto.percentage.toFixed(4)),
            minInvoiceAmount: new client_1.Prisma.Decimal((dto.minInvoiceAmount ?? 0).toFixed(4)),
            payoutTiming: dto.payoutTiming ?? 'IMMEDIATE',
            linkedToDebt: dto.linkedToDebt ?? false,
        };
        if (existing) {
            return this.prisma.commissionRule.update({
                where: { id: existing.id },
                data,
            });
        }
        return this.prisma.commissionRule.create({ data });
    }
};
exports.CommissionRulesService = CommissionRulesService;
exports.CommissionRulesService = CommissionRulesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CommissionRulesService);
//# sourceMappingURL=commission-rules.service.js.map