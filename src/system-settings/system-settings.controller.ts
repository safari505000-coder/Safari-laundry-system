import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { UpdateDebtHoldPolicyDto } from './dto/update-debt-hold-policy.dto';
import { UpdatePayrollSettingsDto } from './dto/update-payroll-settings.dto';
import { UpdateToggleDto } from './dto/update-toggle.dto';
import { SystemSettingsService } from './system-settings.service';

@ApiTags('system-settings')
@ApiBearerAuth('bearer')
@Controller('system-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get('toggles')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `List master subsystem toggles (${APP_BRAND})`,
  })
  listToggles(@CurrentUser() user: JwtUser) {
    return this.service.listToggles(user.role as SafariRole);
  }

  @Patch('toggles')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: `Set a subsystem toggle (${APP_BRAND})` })
  setToggle(@Body() dto: UpdateToggleDto, @CurrentUser() user: JwtUser) {
    return this.service.setToggle(
      user.role as SafariRole,
      user.userId,
      dto.key,
      dto.isEnabled,
    );
  }

  @Get('debt-hold-policy')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  @ApiOperation({ summary: `Fetch debt-hold policy (${APP_BRAND})` })
  getPolicy() {
    return this.service.getDebtHoldPolicy();
  }

  @Put('debt-hold-policy')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: `Update debt-hold policy (${APP_BRAND})` })
  updatePolicy(
    @Body() dto: UpdateDebtHoldPolicyDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateDebtHoldPolicy(user.role as SafariRole, dto);
  }

  @Get('payroll-settings')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({
    summary: `Fetch payroll-level settings singleton (${APP_BRAND})`,
  })
  getPayrollSettings() {
    return this.service.getPayrollSettings();
  }

  @Put('payroll-settings')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Update payroll-level settings singleton (${APP_BRAND})`,
  })
  updatePayrollSettings(
    @Body() dto: UpdatePayrollSettingsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updatePayrollSettings(user.role as SafariRole, dto);
  }
}
