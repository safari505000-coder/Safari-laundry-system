import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommissionMode, Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto';

/**
 * V19.16 — CRUD for `CommissionRule`. Owner writes; GM / Accountant read.
 * The backend `CommissionEarningService` reads active rules at earning time.
 */
@Injectable()
export class CommissionRulesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanReadRules(role: SafariRole): void {
    if (
      role !== SafariRole.OWNER &&
      role !== SafariRole.GENERAL_MANAGER &&
      role !== SafariRole.ACCOUNTANT
    ) {
      throw new ForbiddenException();
    }
  }

  private assertOwnerWrites(role: SafariRole): void {
    if (role !== SafariRole.OWNER) {
      throw new ForbiddenException();
    }
  }

  async list(actorRole: SafariRole, opts?: { mode?: CommissionMode }) {
    this.assertCanReadRules(actorRole);
    return this.prisma.commissionRule.findMany({
      where: opts?.mode ? { mode: opts.mode } : {},
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async findOne(actorRole: SafariRole, id: string) {
    this.assertCanReadRules(actorRole);
    const row = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Commission rule not found');
    return row;
  }

  async create(actorRole: SafariRole, dto: CreateCommissionRuleDto) {
    this.assertOwnerWrites(actorRole);
    return this.prisma.commissionRule.create({
      data: {
        name: dto.name,
        isActive: dto.isActive ?? true,
        role: dto.role ?? null,
        mode: dto.mode,
        calculationBase: dto.calculationBase ?? 'ORDER_TOTAL',
        percentage: new Prisma.Decimal(dto.percentage.toFixed(4)),
        minInvoiceAmount: new Prisma.Decimal(
          (dto.minInvoiceAmount ?? 0).toFixed(4),
        ),
        payoutTiming: dto.payoutTiming ?? 'IMMEDIATE',
        linkedToDebt: dto.linkedToDebt ?? false,
      },
    });
  }

  async update(
    actorRole: SafariRole,
    id: string,
    dto: UpdateCommissionRuleDto,
  ) {
    this.assertOwnerWrites(actorRole);
    await this.findOne(actorRole, id);
    const data: Prisma.CommissionRuleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.role !== undefined) data.role = dto.role ?? null;
    if (dto.mode !== undefined) data.mode = dto.mode;
    if (dto.calculationBase !== undefined)
      data.calculationBase = dto.calculationBase;
    if (dto.percentage !== undefined)
      data.percentage = new Prisma.Decimal(dto.percentage.toFixed(4));
    if (dto.minInvoiceAmount !== undefined)
      data.minInvoiceAmount = new Prisma.Decimal(
        dto.minInvoiceAmount.toFixed(4),
      );
    if (dto.payoutTiming !== undefined) data.payoutTiming = dto.payoutTiming;
    if (dto.linkedToDebt !== undefined) data.linkedToDebt = dto.linkedToDebt;
    return this.prisma.commissionRule.update({ where: { id }, data });
  }

  async remove(actorRole: SafariRole, id: string) {
    this.assertOwnerWrites(actorRole);
    await this.findOne(actorRole, id);
    return this.prisma.commissionRule.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getDefaultRule(actorRole: SafariRole) {
    this.assertCanReadRules(actorRole);
    return this.prisma.commissionRule.findFirst({
      where: { role: null },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async upsertDefaultRule(
    actorRole: SafariRole,
    dto: CreateCommissionRuleDto,
  ) {
    this.assertOwnerWrites(actorRole);
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
      percentage: new Prisma.Decimal(dto.percentage.toFixed(4)),
      minInvoiceAmount: new Prisma.Decimal(
        (dto.minInvoiceAmount ?? 0).toFixed(4),
      ),
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
}
