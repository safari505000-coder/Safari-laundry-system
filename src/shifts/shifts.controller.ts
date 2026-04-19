import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { ShiftCycleService } from './shift-cycle.service';

@ApiTags('shifts')
@ApiBearerAuth('bearer')
@Controller('shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShiftsController {
  constructor(private readonly shiftCycle: ShiftCycleService) {}

  @Get('cycle/current')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Current financial cycle snapshot (${APP_BRAND})`,
    description:
      'Returns the Kuwait-midnight cycle window, driver coverage, and stale shift count. Used by the Owner control panel.',
  })
  getCurrentCycle() {
    return this.shiftCycle.getCurrentCycle();
  }

  @Get('cycle/recent')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Recent cycle history (${APP_BRAND})`,
    description:
      'Aggregated open/close counts per Kuwait-midnight cycle. Default = last 7 cycles, cap 30.',
  })
  getRecentCycles(@Query('days') days?: string) {
    const n = days ? Number.parseInt(days, 10) : 7;
    return this.shiftCycle.getRecentCycles(Number.isFinite(n) ? n : 7);
  }

  @Post('cycle/run-now')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Manually trigger the midnight cycle (${APP_BRAND}, OWNER master override)`,
    description:
      'OWNER-only fallback. Closes stale OPEN shifts and opens fresh shifts for every active driver. Idempotent.',
  })
  runNow() {
    return this.shiftCycle.runDailyCycle();
  }
}
