import {
  Body,
  Controller,
  Get,
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
import { AttendanceService } from './attendance.service';
import { BiometricEventDto } from './dto/biometric-event.dto';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import { ManualAttendanceDto } from './dto/manual-attendance.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';

/**
 * Stage-D attendance endpoints.
 *
 *   GET  /api/attendance             — list rows (OWNER / GM / MGR / ACC)
 *   POST /api/attendance/manual      — create/correct a row
 *   POST /api/attendance/sync        — back-fill from shifts (OWNER)
 *   POST /api/attendance/biometric   — stub webhook for fingerprint
 *                                      devices (vendor plugs in later)
 */
@ApiTags('attendance')
@ApiBearerAuth('bearer')
@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
  )
  @ApiOperation({
    summary: `List attendance rows (${APP_BRAND})`,
    description:
      'Returns up to 500 attendance rows matching the filters. Dates are logical Kuwait-local days. DUSTUR §6.',
  })
  list(@Query() q: ListAttendanceQueryDto) {
    return this.attendance.list(q);
  }

  @Post('manual')
  @Roles(
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({
    summary: `Create / correct an attendance row manually (${APP_BRAND})`,
    description:
      'Admin / HR correction channel. Upserts the (userId, date) pair and stamps source=MANUAL.',
  })
  manual(
    @Body() dto: ManualAttendanceDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.attendance.upsertManual(user.role as SafariRole, dto);
  }

  @Post('sync')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Back-fill attendance from shifts (${APP_BRAND})`,
    description:
      'OWNER-only. Manually runs the SHIFT_AUTO sync for a specific [from,to) range. Idempotent.',
  })
  sync(@Query('from') from: string, @Query('to') to: string) {
    return this.attendance.triggerSync(from, to);
  }

  @Post('biometric')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Biometric device webhook (${APP_BRAND}, HR-BIO-001 stub)`,
    description:
      'Accepts fingerprint / face-scan events and upserts the matching (userId, Kuwait-date) row. The concrete vendor driver plugs in later without changing this contract.',
  })
  biometric(@Body() dto: BiometricEventDto) {
    return this.attendance.recordBiometricEvent(dto);
  }
}
