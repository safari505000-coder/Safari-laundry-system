import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReplayQueueDto } from './dto/replay-queue.dto';
import { QueueAdminService } from './queue-admin.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@ApiTags('queue-admin')
@ApiBearerAuth('bearer')
@Controller()
@Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
export class QueueAdminController {
  constructor(
    private readonly queues: QueueAdminService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Post('admin/queues/replay')
  @ApiOperation({ summary: 'Replay failed BullMQ DLQ jobs' })
  replay(@Body() dto: ReplayQueueDto) {
    return this.queues.replay(dto.queue, dto.limit ?? 25);
  }

  @Get('metrics/queues')
  @ApiOperation({ summary: 'Queue metrics and circuit breaker states' })
  metrics() {
    return this.queues.metrics();
  }

  @Get('admin/queues/dlq')
  @ApiOperation({ summary: 'List failed DLQ jobs' })
  dlq(
    @Query('queue') queue?: 'alerts' | 'whatsapp',
    @Query('limit') limit?: string,
  ) {
    return this.queues.listDlq(queue, Number.parseInt(limit ?? '50', 10) || 50);
  }

  @Post('admin/queues/replay/:jobId')
  @ApiOperation({ summary: 'Replay one failed DLQ job' })
  replayOne(
    @Param('jobId') jobId: string,
    @Body() dto: ReplayQueueDto,
  ) {
    return this.queues.replayJob(dto.queue, jobId);
  }

  @Post('admin/queues/replay-all')
  @ApiOperation({ summary: 'Replay failed DLQ jobs with rate limiting' })
  replayAll(@Body() dto: ReplayQueueDto) {
    return this.queues.replay(dto.queue, dto.limit ?? 25);
  }

  @Get('admin/audit/verify')
  @ApiOperation({ summary: 'Verify immutable audit hash chain' })
  verifyAudit() {
    return this.auditLogs.verifyAuditIntegrity();
  }
}
