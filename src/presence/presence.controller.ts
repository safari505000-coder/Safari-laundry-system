import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from '../users/users.service';
import {
  HeartbeatBodyDto,
  HeartbeatResponseDto,
  PresenceListResponseDto,
} from './dto/presence.dto';
import { PresenceService } from './presence.service';

/**
 * V23 Phase 6 — Operator Presence controller.
 *
 * Visibility-only HTTP surface for the operator-presence registry.
 * The endpoints accept the JWT identity of the caller (cannot be
 * spoofed) and project a small public shape to peers.
 *
 * Endpoints:
 *   POST   /api/presence/heartbeat                       — refresh my presence on a scope
 *   DELETE /api/presence/heartbeat                       — explicit release
 *   GET    /api/presence/customer/:customerId            — co-viewers on a customer
 *   GET    /api/presence/active                          — live operators (branch-scoped)
 *
 * All endpoints are gated to operational roles only — no DRIVER or
 * CUSTOMER, since those personas do not coordinate inside the
 * back-office surfaces.
 */
@ApiTags('presence')
@ApiBearerAuth('bearer')
@Controller('presence')
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
export class PresenceController {
  /**
   * Cache the user-display lookup so a busy operator doesn't trigger
   * a Prisma round-trip on every heartbeat. TTL is short (60s) so
   * username changes propagate quickly.
   */
  private readonly displayCache = new Map<
    string,
    { username: string; fullName: string | null; expiresAt: number }
  >();
  private static readonly DISPLAY_TTL_MS = 60_000;

  constructor(
    private readonly presence: PresenceService,
    private readonly users: UsersService,
  ) {}

  @Post('heartbeat')
  @ApiOperation({
    summary: 'Refresh operator presence on a scope (visibility-only)',
  })
  @ApiOkResponse({ type: HeartbeatResponseDto })
  async heartbeat(
    @CurrentUser() user: JwtUser,
    @Body() body: HeartbeatBodyDto,
  ): Promise<HeartbeatResponseDto> {
    const display = await this.resolveDisplay(user.userId);
    return this.presence.recordHeartbeat({
      userId: user.userId,
      username: display.username,
      fullName: display.fullName,
      safariRole: user.role,
      branchId: user.branchId ?? null,
      scopeKind: body.scopeKind,
      scopeId: body.scopeId,
    });
  }

  @Delete('heartbeat')
  @ApiOperation({ summary: 'Explicitly release my presence on a scope' })
  release(
    @CurrentUser() user: JwtUser,
    @Body() body: HeartbeatBodyDto,
  ): { released: true } {
    this.presence.release({
      userId: user.userId,
      scopeKind: body.scopeKind,
      scopeId: body.scopeId,
    });
    return { released: true };
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Live co-viewers on a single customer' })
  @ApiOkResponse({ type: PresenceListResponseDto })
  customerCoviewers(
    @CurrentUser() user: JwtUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): PresenceListResponseDto {
    const all = this.presence.getCustomerPresence(customerId);
    // Hide the caller's own row — operators care about *other* people on the record.
    const operators = all.filter((row) => row.userId !== user.userId);
    return {
      operators,
      computedAt: new Date().toISOString(),
    };
  }

  @Get('active')
  @ApiOperation({
    summary: 'All currently-active operators (optionally branch-scoped via JWT)',
  })
  @ApiOkResponse({ type: PresenceListResponseDto })
  active(@CurrentUser() user: JwtUser): PresenceListResponseDto {
    // Owner/GM/Accountant see everyone; branch-scoped roles see their branch only.
    const branchScope =
      user.role === 'OWNER' ||
      user.role === 'GENERAL_MANAGER' ||
      user.role === 'ACCOUNTANT' ||
      user.role === 'CALL_CENTER_SUPERVISOR'
        ? null
        : user.branchId ?? null;
    return {
      operators: this.presence.getActiveOperators({ branchId: branchScope }),
      computedAt: new Date().toISOString(),
    };
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
      expiresAt: now + PresenceController.DISPLAY_TTL_MS,
    });
    return display;
  }
}
