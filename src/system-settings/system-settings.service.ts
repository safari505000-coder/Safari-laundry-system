import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  DebtHoldMode,
  Prisma,
  SafariRole,
  SystemToggleKey,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDebtHoldPolicyDto } from './dto/update-debt-hold-policy.dto';

/**
 * V19.16 — central registry of master ON/OFF toggles + the singleton
 * DebtHoldPolicy. Other services call `isEnabled(key)` to gate their
 * entry points (commission hooks, debt-hold computation, attendance
 * capture, etc.). A missing toggle row is treated as ENABLED so
 * migrating from pre-V19.16 keeps existing behaviour.
 */
@Injectable()
export class SystemSettingsService {
  /**
   * Literal id of the `DebtHoldPolicy` singleton row.
   */
  private static readonly POLICY_ID = 'singleton';

  constructor(private readonly prisma: PrismaService) {}

  private assertCanViewSettings(role: SafariRole): void {
    if (role !== SafariRole.OWNER && role !== SafariRole.GENERAL_MANAGER) {
      throw new ForbiddenException();
    }
  }

  private assertOwnerWrites(role: SafariRole): void {
    if (role !== SafariRole.OWNER) {
      throw new ForbiddenException();
    }
  }

  // ─── Master toggles ───────────────────────────────────────────────
  /**
   * Return the full toggle registry. Missing keys are injected with
   * `isEnabled = true` (fail-open) so the Owner UI can always render a
   * row for every known subsystem even on a fresh install.
   */
  async listToggles(actorRole: SafariRole) {
    this.assertCanViewSettings(actorRole);
    const rows = await this.prisma.systemToggle.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return Object.values(SystemToggleKey).map((key) => {
      const row = byKey.get(key);
      return {
        key,
        isEnabled: row?.isEnabled ?? true,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
      };
    });
  }

  async setToggle(
    actorRole: SafariRole,
    actorUserId: string,
    key: SystemToggleKey,
    isEnabled: boolean,
  ) {
    this.assertOwnerWrites(actorRole);
    return this.prisma.systemToggle.upsert({
      where: { key },
      create: { key, isEnabled, updatedBy: actorUserId },
      update: { isEnabled, updatedBy: actorUserId },
    });
  }

  /**
   * Fast path used by other services — returns the toggle state without
   * any role gate. Consumers MUST be server-side only.
   */
  async isEnabled(key: SystemToggleKey): Promise<boolean> {
    const row = await this.prisma.systemToggle.findUnique({ where: { key } });
    return row?.isEnabled ?? true;
  }

  // ─── DebtHoldPolicy (singleton) ───────────────────────────────────
  async getDebtHoldPolicy() {
    const row = await this.prisma.debtHoldPolicy.findUnique({
      where: { id: SystemSettingsService.POLICY_ID },
    });
    if (row) return row;
    // Lazy-seed the singleton so the API never returns 404 on a fresh
    // install that skipped the migration seed block.
    return this.prisma.debtHoldPolicy.create({
      data: {
        id: SystemSettingsService.POLICY_ID,
        isActive: false,
        holdMode: DebtHoldMode.FULL,
      },
    });
  }

  async updateDebtHoldPolicy(
    actorRole: SafariRole,
    dto: UpdateDebtHoldPolicyDto,
  ) {
    this.assertOwnerWrites(actorRole);
    if (dto.holdMode === DebtHoldMode.FIXED && dto.fixedAmount == null) {
      throw new BadRequestException(
        'fixedAmount is required when holdMode = FIXED',
      );
    }
    const fixed =
      dto.holdMode === DebtHoldMode.FIXED && dto.fixedAmount != null
        ? new Prisma.Decimal(dto.fixedAmount.toFixed(4))
        : null;
    return this.prisma.debtHoldPolicy.upsert({
      where: { id: SystemSettingsService.POLICY_ID },
      create: {
        id: SystemSettingsService.POLICY_ID,
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

  // ─── PayrollSettings (singleton, V19.17) ──────────────────────────
  /**
   * Fetch the singleton row or lazily create it if a migration-run
   * seed was skipped. Public read — the Owner UI surfaces it on the
   * Settings Dashboard.
   */
  async getPayrollSettings() {
    const row = await this.prisma.payrollSettings.findUnique({
      where: { id: SystemSettingsService.POLICY_ID },
    });
    if (row) return row;
    return this.prisma.payrollSettings.create({
      data: {
        id: SystemSettingsService.POLICY_ID,
        payDayOfMonth: 1,
        autoDeductLoans: true,
        linkWithAttendance: false,
      },
    });
  }

  async updatePayrollSettings(
    actorRole: SafariRole,
    dto: {
      payDayOfMonth: number;
      autoDeductLoans: boolean;
      linkWithAttendance: boolean;
    },
  ) {
    this.assertOwnerWrites(actorRole);
    // Clamp to [1,28] to avoid month-end drift (Feb has 28 days).
    if (
      !Number.isInteger(dto.payDayOfMonth) ||
      dto.payDayOfMonth < 1 ||
      dto.payDayOfMonth > 28
    ) {
      throw new BadRequestException('payDayOfMonth must be between 1 and 28');
    }
    return this.prisma.payrollSettings.upsert({
      where: { id: SystemSettingsService.POLICY_ID },
      create: {
        id: SystemSettingsService.POLICY_ID,
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
}
