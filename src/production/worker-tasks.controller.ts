import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AddNoteDto, ReportIssueDto, WorkerTaskQueryDto } from './dto/production.dto';
import { ProductionService } from './production.service';

/**
 * WORKER production surface. A worker sees ONLY their own tasks and the
 * open queue at their own branch — no finance, cash, customer, or
 * cross-worker data is ever exposed here (RolesGuard + service-level
 * branch + ownership checks). OWNER bypasses RolesGuard for support.
 */
@ApiTags('worker-production')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.WORKER)
@Controller('worker/tasks')
export class WorkerTasksController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  @ApiOperation({ summary: "List the worker's current production tasks" })
  list(@CurrentUser() user: JwtUser, @Query() query: WorkerTaskQueryDto) {
    return this.production.listWorkerTasks(user, query);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Limited, blame-free timeline for an assigned task' })
  timeline(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.production.getWorkerGarmentTimeline(user, id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept the next-stage task before working it' })
  accept(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.production.acceptTask(user, id);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start an accepted task' })
  start(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.production.startTask(user, id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete an in-progress task and hand off' })
  complete(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.production.completeTask(user, id);
  }

  @Post(':id/report-issue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report a quality/handling issue (moves to QUALITY_HOLD)' })
  reportIssue(
    @Param('id') id: string,
    @Body() dto: ReportIssueDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.production.reportIssue(user, id, dto);
  }

  @Post(':id/note')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Append an internal note to a task' })
  note(
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.production.addNote(user, id, dto);
  }
}
