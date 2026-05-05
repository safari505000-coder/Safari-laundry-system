import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogsQueryDto } from './dto/audit-logs-query.dto';
import { AuditLogTimelineResponseDto } from './dto/audit-logs-timeline.dto';

@ApiTags('audit')
@ApiBearerAuth('bearer')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get('logs')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Audit timeline',
    description:
      'Read-only audit timeline for financial/customer events. Supports customerId, orderId, and driverId filters.',
  })
  listLogs(@Query() query: AuditLogsQueryDto): Promise<AuditLogTimelineResponseDto> {
    return this.auditLogs.listTimeline(query);
  }
}
