import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser, JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccountSecurityService } from './account-security.service';
import {
  DeviceDto,
  LoginHistoryDto,
  MfaActivateResponseDto,
  MfaCodeDto,
  MfaEnrollResponseDto,
  MfaStatusResponseDto,
  SessionDto,
  TrustDeviceDto,
} from './dto/account-security.dto';

/**
 * V10 HARDENING — self-service account security for privileged staff.
 * Scoped to OWNER and ACCOUNTANT (the MFA-required roles). Every endpoint
 * operates only on the caller's own account and writes an audit log.
 */
@ApiTags('account-security')
@ApiBearerAuth('bearer')
@Controller('owner/security')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.OWNER, SafariRole.ACCOUNTANT)
export class AccountSecurityController {
  constructor(private readonly accountSecurity: AccountSecurityService) {}

  @Post('mfa/enroll')
  @ApiOperation({ summary: 'Start MFA (TOTP) enrollment for the current user' })
  @ApiOkResponse({ type: MfaEnrollResponseDto })
  enrollMfa(@CurrentUser() user: JwtUser): Promise<MfaEnrollResponseDto> {
    return this.accountSecurity.enrollMfa(user.userId);
  }

  @Post('mfa/activate')
  @ApiOperation({ summary: 'Confirm enrollment with a TOTP code and activate MFA' })
  @ApiOkResponse({ type: MfaActivateResponseDto })
  activateMfa(
    @CurrentUser() user: JwtUser,
    @Body() dto: MfaCodeDto,
  ): Promise<MfaActivateResponseDto> {
    return this.accountSecurity.activateMfa(user.userId, dto.code);
  }

  @Post('mfa/disable')
  @ApiOperation({ summary: 'Disable MFA after re-verifying a TOTP or recovery code' })
  disableMfa(
    @CurrentUser() user: JwtUser,
    @Body() dto: MfaCodeDto,
  ): Promise<{ status: string }> {
    return this.accountSecurity.disableMfa(user.userId, dto.code);
  }

  @Get('mfa/status')
  @ApiOperation({ summary: 'Current MFA status for the user' })
  @ApiOkResponse({ type: MfaStatusResponseDto })
  mfaStatus(@CurrentUser() user: JwtUser): Promise<MfaStatusResponseDto> {
    return this.accountSecurity.getMfaStatus(user.userId, user.role);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions for the current user' })
  @ApiOkResponse({ type: [SessionDto] })
  listSessions(@CurrentUser() user: JwtUser): Promise<SessionDto[]> {
    return this.accountSecurity.listSessions(user.userId);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Forced logout: revoke a single active session' })
  revokeSession(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ): Promise<{ revoked: number }> {
    return this.accountSecurity.revokeSession(user.userId, id);
  }

  @Post('sessions/revoke-all')
  @ApiOperation({ summary: 'Forced logout: revoke all active sessions' })
  revokeAllSessions(
    @CurrentUser() user: JwtUser,
    @Query('except') except?: string,
  ): Promise<{ revoked: number }> {
    return this.accountSecurity.revokeAllSessions(user.userId, except);
  }

  @Get('login-history')
  @ApiOperation({ summary: 'Recent login history for the current user' })
  @ApiOkResponse({ type: [LoginHistoryDto] })
  loginHistory(
    @CurrentUser() user: JwtUser,
    @Query('limit') limit?: string,
  ): Promise<LoginHistoryDto[]> {
    const parsed = limit ? Number.parseInt(limit, 10) : undefined;
    return this.accountSecurity.listLoginHistory(
      user.userId,
      Number.isFinite(parsed) ? (parsed as number) : undefined,
    );
  }

  @Get('devices')
  @ApiOperation({ summary: 'List known devices for the current user' })
  @ApiOkResponse({ type: [DeviceDto] })
  listDevices(@CurrentUser() user: JwtUser): Promise<DeviceDto[]> {
    return this.accountSecurity.listDevices(user.userId);
  }

  @Post('devices/trust')
  @ApiOperation({ summary: 'Mark a device as trusted' })
  trustDevice(
    @CurrentUser() user: JwtUser,
    @Body() dto: TrustDeviceDto,
  ): Promise<{ deviceId: string; trusted: boolean }> {
    return this.accountSecurity.setDeviceTrust(user.userId, dto.deviceId, true, dto.label);
  }

  @Post('devices/untrust')
  @ApiOperation({ summary: 'Mark a device as untrusted' })
  untrustDevice(
    @CurrentUser() user: JwtUser,
    @Body() dto: TrustDeviceDto,
  ): Promise<{ deviceId: string; trusted: boolean }> {
    return this.accountSecurity.setDeviceTrust(user.userId, dto.deviceId, false);
  }
}
