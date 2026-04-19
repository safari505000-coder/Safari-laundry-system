import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { SerialsService } from './serials.service';

/**
 * Dastur §1 (V1.5) — Owner-only serial management island.
 *
 * - `GET  /owner/serials/drivers`     list drivers + current prefixes
 * - `PATCH /owner/serials/drivers/:id` set/clear a driver's single-letter prefix
 * - `GET  /owner/serials/log`         recent orders with stamped serials
 */
@ApiTags('owner-serials')
@ApiBearerAuth('bearer')
@Controller('owner/serials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
export class SerialsController {
  constructor(private readonly serials: SerialsService) {}

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
}
