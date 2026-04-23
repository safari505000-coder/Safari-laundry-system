import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
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
import { DriverOversightService } from './driver-oversight.service';

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
  constructor(private readonly svc: DriverOversightService) {}

  @Get()
  @Roles(SafariRole.MANAGER, SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Branch Driver Oversight — daily cards (${APP_BRAND})`,
    description:
      'Returns one `DriverOversightCard` per active DRIVER in the caller\'s scope. MANAGER → drivers of their own branch (`user.branchId`). OWNER / GENERAL_MANAGER → every active driver across the company. Each card bundles shift status, today\'s invoice count + cash, pending unsettled invoices, cash on hand, and the stale quick-capture tally (same 24 h threshold as the Accountant watchdog).',
  })
  list(@CurrentUser() user: JwtUser) {
    if (user.role === SafariRole.MANAGER) {
      return this.svc.listForBranchManager(user.branchId);
    }
    if (
      user.role === SafariRole.OWNER ||
      user.role === SafariRole.GENERAL_MANAGER
    ) {
      return this.svc.listForAllBranches();
    }
    throw new ForbiddenException('Driver oversight is MANAGER-only.');
  }
}
