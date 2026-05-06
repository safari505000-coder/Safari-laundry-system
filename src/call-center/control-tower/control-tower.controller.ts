import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import type { Observable } from 'rxjs';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ControlTowerService } from './control-tower.service';
import { ControlTowerStreamService } from './control-tower-stream.service';
import { ControlTowerQueryDto } from './dto/control-tower-query.dto';
import type { ControlTowerResponseDto } from './dto/control-tower-response.dto';

const CONTROL_TOWER_ROLES = [
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
  SafariRole.OWNER,
] as const;

/**
 * V19.x — Call Center Control Tower — consolidated AR/workload snapshot.
 *
 * Routes mount under global `/api` prefix:
 *   - GET   /api/call-center/control-tower
 *   - SSE   /api/call-center/control-tower/stream
 */
@ApiTags('call-center.control-tower')
@ApiBearerAuth('bearer')
@Controller('call-center/control-tower')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CONTROL_TOWER_ROLES)
export class ControlTowerController {
  constructor(
    private readonly controlTower: ControlTowerService,
    private readonly streamService: ControlTowerStreamService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Control Tower dashboard snapshot',
    description:
      'Read-only AR snapshot (`cashStatus=UNPAID`, `status≠CANCELED`), manual collection risk, active dispatch workload & SLA tiers (≥2m late / ≥5m escalated / ≥10m breached).',
  })
  snapshot(@Query() query: ControlTowerQueryDto): Promise<ControlTowerResponseDto> {
    return this.controlTower.getSnapshot(query);
  }

  @Sse('stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'SSE — Control Tower refresh hints',
    description:
      'Named events: `control-tower:update` (payload JSON includes `kind`), `heartbeat` every ~12s. JWT via `?access_token=` or Authorization header on EventSource-capable clients.',
  })
  sse(): Observable<MessageEvent> {
    return this.streamService.subscribeFeed();
  }
}
