import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OwnerCommandCenterService } from './owner-command-center.service';

/**
 * V10 HARDENING — Owner-facing system health + executive command center.
 * Read-only aggregation. No accounting writes. OWNER only.
 */
@ApiTags('owner-command-center')
@ApiBearerAuth('bearer')
@Controller('owner')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.OWNER)
export class OwnerCommandCenterController {
  constructor(private readonly service: OwnerCommandCenterService) {}

  @Get('system-health')
  @ApiOperation({
    summary: 'Unified system health dashboard',
    description:
      'Database, Redis, queue, failed jobs, API error rate, active users, disk and memory usage.',
  })
  getSystemHealth() {
    return this.service.getSystemHealth();
  }

  @Get('command-center')
  @ApiOperation({
    summary: 'Executive command center snapshot',
    description:
      'Daily revenue, outstanding debts, driver custody, pending deposits, payroll due, failed payments, security and system alerts — in one page.',
  })
  getCommandCenter() {
    return this.service.getCommandCenter();
  }
}
