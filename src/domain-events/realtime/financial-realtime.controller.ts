import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SafariRole } from '@prisma/client';
import type { Observable } from 'rxjs';
import { FinancialRealtimeGateway } from './financial-realtime.gateway';
import {
  channelById,
  isRoleAllowed,
  type RealtimeChannelId,
  type RealtimeRole,
} from './financial-realtime.types';

/**
 * V20.9 — Phase 2 SSE controller for the Realtime Gateway.
 *
 * URL pattern:
 *   GET /api/realtime/financial/:channel/stream?customer=<id>
 *
 * Auth:
 *   • JWT in `Authorization: Bearer …` (preferred) or
 *     `?access_token=…` (browser EventSource fallback — same
 *     pattern the existing driver-dispatch and control-tower
 *     SSE controllers use).
 *   • RolesGuard restricts the hub to roles allowed on AT LEAST
 *     ONE channel. Per-channel role gate runs again inside the
 *     handler before the subscription is created.
 *
 * Heartbeat:
 *   The gateway emits a `heartbeat` named event every
 *   `REALTIME_HEARTBEAT_MS` (= 15s) so reverse proxies don't
 *   close the idle stream.
 *
 * Reconnect:
 *   Browser EventSource auto-reconnects natively. Each event
 *   carries an `id:` line so the next connection sends
 *   `Last-Event-ID:` and the gateway skips already-seen events
 *   (the consumer dedups via the V20.6 `recordConsumed` table —
 *   no duplicate side-effects).
 */
@ApiTags('realtime.financial')
@ApiBearerAuth('bearer')
@Controller('realtime/financial')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
)
export class FinancialRealtimeController {
  constructor(private readonly gateway: FinancialRealtimeGateway) {}

  @Sse(':channel/stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'V20.9 — Realtime financial channel feed',
    description:
      'Server-Sent Events stream of canonical financial events for the given channel. Named events: `finance:event` (full envelope), `heartbeat` (every 15s).',
  })
  stream(
    @Param('channel') channelId: string,
    @Query('customer') customerScope: string | undefined,
    @Query('branch') branchScope: string | undefined,
    @Req() req: { user?: { role?: string } },
  ): Observable<MessageEvent> {
    const channel = channelById(channelId as RealtimeChannelId);
    if (!channel) {
      throw new ForbiddenException(
        `Unknown realtime channel: ${channelId}`,
      );
    }
    const role = (req.user?.role ?? '') as RealtimeRole;
    if (!isRoleAllowed(role, channel)) {
      throw new ForbiddenException(
        `Role ${role} is not allowed on channel ${channelId}`,
      );
    }
    return this.gateway.subscribe({
      channel: channel.id,
      role,
      customerScope: customerScope ?? null,
      branchScope: branchScope ?? null,
    });
  }
}
