import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';

@ApiTags('reports')
@ApiBearerAuth('bearer')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  @Get('manager-summary')
  @Roles(
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.SUPERVISOR,
    SafariRole.ACCOUNTANT,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Management report summary (${APP_BRAND})`,
    description:
      'Operational metrics for OWNER and MANAGER roles only. DRIVER role is excluded by institutional RBAC.',
  })
  managerSummary() {
    return {
      title: 'Management operations summary',
      period: new Date().toISOString().slice(0, 10),
      branchesActive: 0,
      note: 'Placeholder — connect to corporate analytics when ready.',
    };
  }
}
