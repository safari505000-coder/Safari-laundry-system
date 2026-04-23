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
 * V19.16 — CRUD for `CommissionRule`. Owner / GM only. The backend
 * `CommissionEarningService` reads active rules at earning time and
 * picks the most-specific one per (mode, earner-role). This service is
 * purely storage — it never touches `CommissionPayout` rows.
 */
@Injectable()
export class CommissionRulesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertOwnerOrGM(role: SafariRole): void {
    if (role !== SafariRole.OWNER && role !== SafariRole.GENERAL_MANAGER) {
      throw new ForbiddenException();
    }
  }

  async list(actorRole: SafariRole, opts?: { mode?: CommissionMode }) {
    this.assertOwnerOrGM(actorRole);
    return this.prisma.commissionRule.findMany({
      where: opts?.mode ? { mode: opts.mode } : {},
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async findOne(actorRole: SafariRole, id: string) {
    this.assertOwnerOrGM(actorRole);
    const row = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Commission rule not found');
    return row;
  }

  async create(actorRole: SafariRole, dto: CreateCommissionRuleDto) {
    this.assertOwnerOrGM(actorRole);
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
    this.assertOwnerOrGM(actorRole);
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
    this.assertOwnerOrGM(actorRole);
    await this.findOne(actorRole, id);
    // Soft-disable instead of hard-delete so historical CommissionPayout
    // rows keep a readable rule reference for the Owner report.
    return this.prisma.commissionRule.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * V19.17 — "Default" rule helper used by the unified Settings
   * Dashboard. The Dashboard exposes a single inline card that edits
   * one rule applying to ALL roles (`role = null`). To keep the
   * storage model unchanged, we treat the most-recently-updated active
   * rule with `role = null` as the "default" one. If none exists yet,
   * the first save creates it. Advanced users can still manage the
   * full list (per-role overrides, multiple concurrent rules) from
   * `/settings/commission-rules`.
   */
  async getDefaultRule(actorRole: SafariRole) {
    this.assertOwnerOrGM(actorRole);
    return this.prisma.commissionRule.findFirst({
      where: { role: null },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async upsertDefaultRule(
    actorRole: SafariRole,
    dto: CreateCommissionRuleDto,
  ) {
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
