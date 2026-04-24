import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import {
  DriverPrefixRowDto,
  SerialLogDto,
  SetDriverPrefixDto,
} from './dto/serials.dto';
import { SerialGapService, type GapReport } from './serial-gap.service';
import { SerialsService } from './serials.service';

/**
 * Dastur §1 (V1.5) + §3.8 + V19.24 — Owner-only serial management island.
 *
 * - `GET  /owner/serials/drivers`      list operators (drivers + managers) + prefixes
 * - `PATCH /owner/serials/drivers/:id` set/clear a single-letter prefix
 * - `GET  /owner/serials/log`          recent orders with stamped serials
 * - `GET  /owner/serials/gaps`         latest per-operator gap scan (audit-backed)
 * - `POST /owner/serials/gaps/scan-now` force a fresh scan (OWNER only)
 */
@ApiTags('owner-serials')
@ApiBearerAuth('bearer')
@Controller('owner/serials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
export class SerialsController {
  constructor(
    private readonly serials: SerialsService,
    private readonly gaps: SerialGapService,
  ) {}

  @Get('drivers')
  @ApiOperation({
    summary: `Drivers & assigned serial prefixes (${APP_BRAND})`,
  })
  listDrivers(): Promise<DriverPrefixRowDto[]> {
    return this.serials.listDrivers();
  }

  @Patch('drivers/:userId')
  @ApiOperation({
    summary: `Set / clear a driver's serial prefix (${APP_BRAND})`,
  })
  setDriverPrefix(
    @Param('userId') userId: string,
    @Body() dto: SetDriverPrefixDto,
  ): Promise<DriverPrefixRowDto> {
    return this.serials.setDriverPrefix(userId, dto.driverPrefix ?? null);
  }

  @Get('log')
  @ApiOperation({
    summary: `Global serial log (most recent orders) (${APP_BRAND})`,
  })
  getSerialLog(@Query('limit') limit?: string): Promise<SerialLogDto> {
    const parsed = limit ? Number.parseInt(limit, 10) : 50;
    return this.serials.getSerialLog(Number.isFinite(parsed) ? parsed : 50);
  }

  @Get('gaps')
  @ApiOperation({
    summary: `Latest order-serial gap scan (${APP_BRAND})`,
  })
  async getLatestGapReport(): Promise<{
    latest: Awaited<ReturnType<SerialGapService['latestReport']>>;
  }> {
    return { latest: await this.gaps.latestReport() };
  }

  @Post('gaps/scan-now')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Force a fresh order-serial gap scan (OWNER only, ${APP_BRAND})`,
  })
  scanGapsNow(): Promise<GapReport> {
    return this.gaps.scanNow();
  }
}
