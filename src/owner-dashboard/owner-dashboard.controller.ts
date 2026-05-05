import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OwnerDashboardCacheResponseDto } from './dto/owner-dashboard-response.dto';
import { OwnerDashboardService } from './owner-dashboard.service';

@ApiTags('owner-dashboard')
@ApiBearerAuth('bearer')
@Controller('admin/owner-dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.OWNER)
export class OwnerDashboardController {
  constructor(private readonly dashboard: OwnerDashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Owner executive dashboard snapshot',
    description:
      'Cached, executive-friendly business and system status. No raw metrics or sensitive diagnostics.',
  })
  @ApiOkResponse({ type: OwnerDashboardCacheResponseDto })
  getDashboard(): Promise<OwnerDashboardCacheResponseDto> {
    return this.dashboard.getCachedDashboard();
  }
}
