import {
  Controller,
  ForbiddenException,
  Get,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import {
  DriverOversightCard,
  DriverOversightService,
} from './driver-oversight.service';

/**
 * Forbidden cash-shaped fields. Driver cash is exposed ONLY by
 * `GET /api/cash-intelligence/dashboard` (SSoT). The
 * `assertNoForbiddenCashFields` guard below blocks any future
 * regression that re-introduces a competing per-driver cash number.
 */
const SSOT_FORBIDDEN_CASH_FIELDS = ['heldCashKd', 'cashTodayKd'] as const;

/**
 * V19.22.5 — Branch-scoped Driver Oversight island.
 *
 * RBAC:
 *   MANAGER  → their branch only.
 *   OWNER / GM → entire company (same payload shape; the FE renders
 *                either one depending on the caller role).
 */
@ApiTags('driver-oversight')
@ApiBearerAuth('bearer')
@Controller('manager/driver-oversight')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriverOversightController {
  private readonly logger = new Logger(DriverOversightController.name);

  constructor(private readonly svc: DriverOversightService) {}

  @Get()
  @Roles(SafariRole.MANAGER, SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Branch Driver Oversight — daily cards (${APP_BRAND})`,
    description:
      "Returns one `DriverOversightCard` per active DRIVER in the caller's scope. MANAGER → drivers of their own branch (`user.branchId`). OWNER / GENERAL_MANAGER → every active driver across the company. Each card bundles shift status, today's invoice count, pending unsettled invoices, and the stale quick-capture tally (same 24 h threshold as the Accountant watchdog). Driver CASH is intentionally NOT in this payload — it is exposed only by GET /api/cash-intelligence/dashboard (SSoT).",
  })
  async list(@CurrentUser() user: JwtUser): Promise<DriverOversightCard[]> {
    let rows: DriverOversightCard[];
    if (user.role === SafariRole.MANAGER) {
      rows = await this.svc.listForBranchManager(user.branchId);
    } else if (
      user.role === SafariRole.OWNER ||
      user.role === SafariRole.GENERAL_MANAGER
    ) {
      rows = await this.svc.listForAllBranches();
    } else {
      throw new ForbiddenException('Driver oversight is MANAGER-only.');
    }
    this.assertNoForbiddenCashFields(rows);
    return rows;
  }

  /**
   * Runtime SSoT guard: every row published by this endpoint MUST
   * have a `null` value for every field listed in
   * `SSOT_FORBIDDEN_CASH_FIELDS`. The fields are kept in the response
   * shape (so old clients don't crash on a missing key) but their
   * values are nullified at the service layer.
   *
   * If a future change accidentally restores a cash number on this
   * endpoint, the guard logs a CRITICAL alert in production and throws
   * in development — preserving the lesson that `/api/cash-intelligence/dashboard`
   * is the only sanctioned source of driver cash.
   */
  private assertNoForbiddenCashFields(rows: DriverOversightCard[]): void {
    const offenders: Array<{
      driverId: string;
      field: (typeof SSOT_FORBIDDEN_CASH_FIELDS)[number];
      value: unknown;
    }> = [];
    for (const row of rows) {
      const r = row as unknown as Record<string, unknown>;
      for (const f of SSOT_FORBIDDEN_CASH_FIELDS) {
        if (r[f] !== null && r[f] !== undefined) {
          offenders.push({ driverId: row.driverId, field: f, value: r[f] });
        }
      }
    }
    if (offenders.length === 0) return;

    const msg = `SSoT VIOLATION: forbidden cash field on /manager/driver-oversight — ${offenders
      .map((o) => `${o.field}=${String(o.value)} (driver=${o.driverId})`)
      .join(
        '; ',
      )}. Driver cash is exposed ONLY by GET /api/cash-intelligence/dashboard.`;
    this.logger.error(msg);
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(msg);
    }
  }
}
