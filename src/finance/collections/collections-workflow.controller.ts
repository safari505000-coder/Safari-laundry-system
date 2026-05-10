import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CollectionsStage, SafariRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type JwtUser,
} from '../../auth/decorators/current-user.decorator';
import { CollectionsWorkflowService } from './collections-workflow.service';

const COLLECTOR_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
]);

const SUPERVISOR_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.CALL_CENTER_SUPERVISOR,
]);

@Controller('api/collections/accounts')
@UseGuards(JwtAuthGuard)
export class CollectionsWorkflowController {
  constructor(private readonly svc: CollectionsWorkflowService) {}

  @Get('overdue-sla')
  async listOverdueSla(
    @CurrentUser() user: JwtUser,
    @Query('limit') limit?: string,
  ) {
    this.assertCollector(user);
    return this.svc.listOverdueSla({
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':customerId')
  async getAccount(
    @CurrentUser() user: JwtUser,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
  ) {
    this.assertCollector(user);
    return this.svc.getAccount(customerId);
  }

  @Post(':customerId/open')
  async open(
    @CurrentUser() user: JwtUser,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body() body: { assignedCollectorId?: string | null } = {},
  ) {
    this.assertCollector(user);
    return this.svc.openOrGet({
      customerId,
      actorId: user.userId,
      assignedCollectorId: body.assignedCollectorId ?? null,
    });
  }

  @Post(':customerId/contact')
  async logContact(
    @CurrentUser() user: JwtUser,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body() body: { notes?: string | null } = {},
  ) {
    this.assertCollector(user);
    return this.svc.recordContact({
      customerId,
      actorId: user.userId,
      notes: body.notes ?? null,
    });
  }

  @Post(':customerId/transition')
  async transition(
    @CurrentUser() user: JwtUser,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body()
    body: {
      toStage: string;
      reason?: string | null;
      nextActionDueAt?: string | null;
      writeOffAmountKd?: string | number | null;
    },
  ) {
    this.assertCollector(user);
    const toStage = this.parseStage(body?.toStage);
    if (
      toStage === CollectionsStage.LEGAL ||
      toStage === CollectionsStage.WRITTEN_OFF
    ) {
      this.assertSupervisor(user);
    }
    return this.svc.transition({
      customerId,
      toStage,
      actorId: user.userId,
      reason: body?.reason ?? null,
      nextActionDueAt:
        body?.nextActionDueAt != null
          ? new Date(body.nextActionDueAt)
          : null,
      writeOffAmountKd: body?.writeOffAmountKd ?? null,
    });
  }

  @Post(':customerId/assign')
  async assign(
    @CurrentUser() user: JwtUser,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body() body: { collectorId: string | null },
  ) {
    this.assertSupervisor(user);
    return this.svc.assign({
      customerId,
      collectorId: body?.collectorId ?? null,
      actorId: user.userId,
    });
  }

  @Post(':customerId/reopen')
  async reopen(
    @CurrentUser() user: JwtUser,
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body() body: { reason?: string | null } = {},
  ) {
    this.assertSupervisor(user);
    return this.svc.reopen({
      customerId,
      actorId: user.userId,
      reason: body?.reason ?? null,
    });
  }

  private parseStage(raw: string | undefined): CollectionsStage {
    if (!raw) throw new BadRequestException('toStage required');
    const upper = raw.trim().toUpperCase();
    if (
      upper === CollectionsStage.NEW ||
      upper === CollectionsStage.CONTACTED ||
      upper === CollectionsStage.FOLLOW_UP ||
      upper === CollectionsStage.PROMISE_TO_PAY ||
      upper === CollectionsStage.ESCALATED ||
      upper === CollectionsStage.LEGAL ||
      upper === CollectionsStage.WRITTEN_OFF ||
      upper === CollectionsStage.CLOSED
    ) {
      return upper as CollectionsStage;
    }
    throw new BadRequestException(`Unknown stage: ${raw}`);
  }

  private assertCollector(user: JwtUser): void {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!COLLECTOR_ROLES.has(role)) {
      throw new ForbiddenException('Collections workflow restricted');
    }
  }

  private assertSupervisor(user: JwtUser): void {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!SUPERVISOR_ROLES.has(role)) {
      throw new ForbiddenException(
        'Only supervisors can assign / reopen / mark LEGAL / WRITTEN_OFF',
      );
    }
  }
}
