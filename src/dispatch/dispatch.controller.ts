import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permissions } from '../auth/permissions/permissions.decorator';
import { AppPermission } from '../auth/permissions/permissions.enum';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { DispatchRowDto, DispatchSnapshotDto } from './dto/dispatch-row.dto';
import { ReassignDispatchDto } from './dto/reassign-dispatch.dto';
import type { Dispatch } from '@prisma/client';
import type { DispatchStreamEventPayload } from './dispatch.events';
import { DispatchService } from './dispatch.service';

/**
 * V19.x — Call-Center Dispatch API.
 *
 * Two halves:
 *   1. `/api/call-center/dispatch/...` for the agents who CREATE
 *      dispatches (MANAGE_DISPATCH).
 *   2. `/api/driver/dispatch/...` for the drivers who CONSUME them
 *      (VIEW_DISPATCH only — read paths only).
 *
 * Both halves intentionally live in the same controller so the SSE
 * stream and the create endpoint share a single dependency-injection
 * scope; the security boundary is the `@Permissions` decorator on
 * each handler.
 */
@ApiTags('dispatch')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}
  // NOTE: New endpoints below (`/reassign`, `/mine/poll`) are added
  // additively — none of the existing handlers, paths, guards, or
  // response shapes change. The poll endpoint exists strictly as a
  // FALLBACK for clients that cannot keep an SSE connection open
  // (mobile background, flaky proxies). The reassign endpoint
  // creates a SUCCESSOR dispatch — it does NOT close the parent;
  // only an Order can do that (Single Source of Truth).

  // ---------------------------------------------------------------------------
  // CALL-CENTER (write + dashboard read)
  // ---------------------------------------------------------------------------

  @Post('call-center/dispatch')
  @Permissions(AppPermission.MANAGE_DISPATCH)
  @ApiOperation({
    summary: 'Create a dispatch (call center → driver)',
    description:
      'Strict semantics: status defaults to ASSIGNED, NO accept/reject, ' +
      'NO money fields. Refuses with 403 CUSTOMER_BLOCKED if the customer ' +
      'is currently blocked. The dispatch closes only when an Order with ' +
      'this dispatchId is created (auto-completion via order.created event).',
  })
  create(
    @Body() dto: CreateDispatchDto,
    @CurrentUser() user: JwtUser,
  ): Promise<DispatchRowDto> {
    return this.dispatch.create({
      customerId: dto.customerId,
      driverId: dto.driverId,
      instructionNote: dto.instructionNote ?? null,
      actorUserId: user.userId,
      actorRole: user.role,
    });
  }

  @Get('call-center/dispatch/active')
  @Permissions(AppPermission.MANAGE_DISPATCH)
  @ApiOperation({
    summary: 'List ACTIVE (ASSIGNED) dispatches for the call-center board',
  })
  listActive(@Query('limit') limitRaw?: string): Promise<DispatchSnapshotDto> {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    return this.dispatch.listActive({ limit });
  }

  /**
   * V19.x — Manually reassign an ASSIGNED dispatch to a different
   * driver. Creates a SUCCESSOR row pointing at the parent (via
   * `parentDispatchId`) and broadcasts the new dispatch to the new
   * driver's SSE channel. The PARENT IS LEFT IN ASSIGNED on purpose
   * — only an Order can close any dispatch in the chain. Either
   * Order will eventually arrive (closes whichever dispatch its
   * `dispatchId` points at via `handleOrderCreated`), or the
   * reconciliation cron picks it up.
   *
   * Validation errors:
   *   - 404 DISPATCH_NOT_FOUND  — wrong id
   *   - 400 DISPATCH_NOT_ASSIGNED — already COMPLETED
   *   - 400 DRIVER_UNCHANGED — pointless reassignment
   *   - 404 DRIVER_NOT_FOUND  — new driver missing / inactive
   *   - 400 DRIVER_ROLE_MISMATCH — new driver is not role DRIVER
   */
  @Post('call-center/dispatch/:id/reassign')
  @Permissions(AppPermission.MANAGE_DISPATCH)
  @ApiOperation({
    summary: 'Reassign an ASSIGNED dispatch to a new driver',
  })
  reassign(
    @Param('id') id: string,
    @Body() dto: ReassignDispatchDto,
    @CurrentUser() user: JwtUser,
  ): Promise<Dispatch> {
    return this.dispatch.reassign({
      dispatchId: id,
      newDriverId: dto.newDriverId,
      reason: dto.reason ?? null,
      actorUserId: user.userId,
      actorRole: user.role,
    });
  }

  // ---------------------------------------------------------------------------
  // DRIVER (READ ONLY — Part 3)
  // ---------------------------------------------------------------------------

  @Get('driver/dispatch/mine')
  @Permissions(AppPermission.VIEW_DISPATCH)
  @ApiOperation({
    summary: "Driver's own dispatch queue (read only — no accept/reject)",
    description:
      "Returns the driver's currently-assigned dispatches plus the most " +
      'recent COMPLETED ones (last hour) so the UI can show a "just closed" ' +
      'fade-out. The route is GUARANTEED safe for the driver UI to call ' +
      'on a polling interval as a fallback when SSE drops.',
  })
  listMine(@CurrentUser() user: JwtUser): Promise<DispatchSnapshotDto> {
    return this.dispatch.listForDriver(user.userId);
  }

  /**
   * V19.x — Polling fallback for clients that cannot maintain a
   * persistent SSE connection (mobile background tabs, corporate
   * proxies, captive Wi-Fi). Returns the SAME snapshot shape as the
   * SSE stream's initial state — drivers can poll it at a 10–30s
   * interval without any feature loss vs. push.
   *
   * The route is intentionally aliased rather than reusing
   * `/driver/dispatch/mine` so client code can express intent
   * ("polling fallback") in the URL and so we can rate-limit the
   * polling path independently in the future without touching the
   * primary read endpoint.
   */
  @Get('driver/dispatch/mine/poll')
  @Permissions(AppPermission.VIEW_DISPATCH)
  @ApiOperation({
    summary: "Driver's dispatch queue (polling fallback for SSE drops)",
  })
  pollMine(@CurrentUser() user: JwtUser): Promise<DispatchSnapshotDto> {
    return this.dispatch.listForDriver(user.userId);
  }

  /**
   * SSE stream for the driver's UI. The driver UI keeps a single
   * EventSource open and renders push events as they arrive. There is
   * NO write capability over this channel — drivers cannot accept or
   * reject. The data shape mirrors `DispatchStreamEventPayload`.
   *
   * NestJS auto-formats yielded `MessageEvent` rows as
   * `data: <json>\n\n` per the WHATWG SSE spec.
   */
  @Sse('driver/dispatch/stream')
  @Permissions(AppPermission.VIEW_DISPATCH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'SSE feed of dispatch updates for the authenticated driver',
  })
  stream(@CurrentUser() user: JwtUser): Observable<MessageEvent> {
    const subject = this.dispatch.subscribeDriverStream(user.userId);
    return subject.asObservable().pipe(
      map(
        (payload: DispatchStreamEventPayload): MessageEvent => ({
          type:
            payload.status === 'COMPLETED'
              ? 'dispatch.completed'
              : 'dispatch.created',
          data: payload,
        }),
      ),
      finalize(() => {
        // Best-effort cleanup when the EventSource disconnects.
        // The next subscriber recreates the subject lazily.
        this.dispatch.unsubscribeDriverStream(user.userId, subject);
      }),
    );
  }
}
