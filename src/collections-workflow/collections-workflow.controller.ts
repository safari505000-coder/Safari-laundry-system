import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from '../users/users.service';
import { CollectionsWorkflowService } from './collections-workflow.service';
import {
  ClaimWorkflowItemDto,
  CreateWorkflowItemDto,
  TransitionWorkflowItemDto,
  WorkflowItemQueryDto,
  WorkflowItemResponse,
  WorkflowQueueSnapshotResponseDto,
} from './dto/collections-workflow.dto';

/**
 * V23.1 Phase 7 — Collections Operational Workflow controller.
 *
 * REST surface for the visibility-only callback / promise / escalation
 * registry consumed by the Collections cockpit UI. The endpoints
 * accept JWT identity (cannot be spoofed) and project a small public
 * shape to peers.
 *
 * Endpoints:
 *   GET    /api/collections/workflow                      — list (filtered)
 *   GET    /api/collections/workflow/queue                — laned snapshot for the cockpit
 *   GET    /api/collections/workflow/:id                  — single item
 *   POST   /api/collections/workflow                      — create item
 *   PATCH  /api/collections/workflow/:id/transition       — change status
 *   PATCH  /api/collections/workflow/:id/claim            — claim/release ownership
 *
 * All endpoints are gated to back-office operational roles only —
 * no DRIVER or CUSTOMER, since those personas don't coordinate
 * inside the cockpit.
 */
@ApiTags('collections.workflow')
@ApiBearerAuth('bearer')
@Controller('collections/workflow')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.SUPERVISOR,
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
  SafariRole.VIEWER,
)
export class CollectionsWorkflowController {
  /** Cache the user-display lookup so a busy cockpit doesn't slam Prisma. */
  private readonly displayCache = new Map<
    string,
    { username: string; fullName: string | null; expiresAt: number }
  >();
  private static readonly DISPLAY_TTL_MS = 60_000;

  constructor(
    private readonly workflow: CollectionsWorkflowService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List workflow items (filtered).' })
  async list(
    @Query() query: WorkflowItemQueryDto,
  ): Promise<WorkflowItemResponse[]> {
    return this.workflow.list({
      customerId: query.customerId ?? null,
      branchId: query.branchId ?? null,
      kind: query.kind ?? null,
      status: query.status ?? null,
      scheduledBeforeIso: query.scheduledBeforeIso ?? null,
      scheduledAfterIso: query.scheduledAfterIso ?? null,
    });
  }

  @Get('queue')
  @ApiOperation({
    summary: 'Cockpit-tailored 3-lane snapshot of OPEN/IN_PROGRESS items.',
  })
  @ApiOkResponse({ type: WorkflowQueueSnapshotResponseDto })
  queueSnapshot(
    @CurrentUser() user: JwtUser,
    @Query('branchId') branchId?: string,
  ): import('./collections-workflow.types').WorkflowQueueSnapshot {
    // Branch scope: same rule as the presence service — institutional roles
    // see everyone, branch-scoped roles see their own branch only.
    const scope =
      user.role === 'OWNER' ||
      user.role === 'GENERAL_MANAGER' ||
      user.role === 'ACCOUNTANT' ||
      user.role === 'CALL_CENTER_SUPERVISOR'
        ? branchId ?? null
        : user.branchId ?? null;
    return this.workflow.queueSnapshot({ branchId: scope });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single workflow item with full history.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): WorkflowItemResponse {
    return this.workflow.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a callback / promise / escalation.' })
  async create(
    @CurrentUser() user: JwtUser,
    @Body() body: CreateWorkflowItemDto,
  ): Promise<WorkflowItemResponse> {
    const display = await this.resolveDisplay(user.userId);
    return this.workflow.create({
      kind: body.kind,
      customerId: body.customerId,
      customerNameSnapshot: body.customerNameSnapshot ?? null,
      orderId: body.orderId ?? null,
      scheduledAt: body.scheduledAt ?? null,
      amountKdSnapshot: body.amountKdSnapshot ?? null,
      priority: body.priority,
      notes: body.notes ?? null,
      branchId: body.branchId ?? user.branchId ?? null,
      actorId: user.userId,
      actorName: display.fullName ?? display.username,
    });
  }

  @Patch(':id/transition')
  @ApiOperation({ summary: 'Transition the status of a workflow item.' })
  async transition(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TransitionWorkflowItemDto,
  ): Promise<WorkflowItemResponse> {
    const display = await this.resolveDisplay(user.userId);
    return this.workflow.transition({
      id,
      nextStatus: body.nextStatus,
      actorId: user.userId,
      actorName: display.fullName ?? display.username,
      notes: body.notes ?? null,
    });
  }

  @Patch(':id/claim')
  @ApiOperation({ summary: 'Claim or release ownership of a workflow item.' })
  async claim(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ClaimWorkflowItemDto,
  ): Promise<WorkflowItemResponse> {
    const display = await this.resolveDisplay(user.userId);
    return this.workflow.claim({
      id,
      release: body.release === true,
      actorId: user.userId,
      actorName: display.fullName ?? display.username,
    });
  }

  private async resolveDisplay(userId: string): Promise<{
    username: string;
    fullName: string | null;
  }> {
    const now = Date.now();
    const cached = this.displayCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return { username: cached.username, fullName: cached.fullName };
    }
    const user = await this.users.findOne(userId);
    const display = {
      username: user.username,
      fullName: user.fullName ?? null,
    };
    this.displayCache.set(userId, {
      ...display,
      expiresAt: now + CollectionsWorkflowController.DISPLAY_TTL_MS,
    });
    return display;
  }
}
