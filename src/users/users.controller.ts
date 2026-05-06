import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { assertInstitutionalMutationAllowed } from '../auth/institutional-mutation.util';
import { AppPermission } from '../auth/permissions/permissions.enum';
import { Permissions } from '../auth/permissions/permissions.decorator';
import { PermissionsService } from '../permissions/permissions.service';
import { BulkResetPasswordBodyDto } from './dto/bulk-reset-password-body.dto';
import { ResetPasswordBodyDto } from './dto/reset-password-body.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateSalaryDefaultsDto } from './dto/update-salary-defaults.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('bearer')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.MANAGER,
  SafariRole.SUPERVISOR,
)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private async assertCanViewStaffDirectory(user: JwtUser): Promise<void> {
    if (
      user.role === SafariRole.OWNER ||
      user.role === SafariRole.GENERAL_MANAGER
    ) {
      return;
    }
    const ok = await this.permissionsService.canManageStaff(user.role);
    if (!ok) {
      throw new ForbiddenException('Missing can_manage_staff capability');
    }
  }

  private async assertCanMutateStaffDirectory(user: JwtUser): Promise<void> {
    assertInstitutionalMutationAllowed(user.role);
    if (user.role === SafariRole.OWNER) {
      return;
    }
    const ok = await this.permissionsService.canManageStaff(user.role);
    if (!ok) {
      throw new ForbiddenException('Missing can_manage_staff capability');
    }
  }

  private requestId(req: {
    headers?: Record<string, unknown>;
    id?: string;
    requestId?: string;
  }): string {
    if (typeof req.requestId === 'string' && req.requestId.length > 0) {
      return req.requestId;
    }
    const h = req.headers ?? {};
    const x =
      (typeof h['x-request-id'] === 'string' && h['x-request-id']) ||
      (Array.isArray(h['x-request-id']) && String(h['x-request-id'][0])) ||
      req.id ||
      'n/a';
    return x;
  }

  @Post()
  @ApiOperation({
    summary: `Create corporate user (${APP_BRAND})`,
    description:
      'Registers a staff member with institutional RBAC: OWNER (full system access), MANAGER (operational access), DRIVER (service delivery access), CALL_CENTER. Requires full name, unique username (login), password, and role.',
  })
  @ApiBody({ type: CreateUserDto })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: JwtUser,
    @Req() req: { headers?: Record<string, unknown>; id?: string },
  ) {
    await this.assertCanMutateStaffDirectory(user);
    const row = await this.usersService.create(dto);
    this.logger.log(
      JSON.stringify({
        event: 'staff.create',
        requestId: this.requestId(req),
        actorUserId: user.userId,
        actorRole: user.role,
        targetUserId: row.id,
        targetRole: row.safariRole,
      }),
    );
    return row;
  }

  @Post('reset-passwords-bulk')
  @Permissions(AppPermission.MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: `Bulk reset passwords (${APP_BRAND})`,
    description:
      'MANAGE_USERS. Applies one temporary password to many accounts; revokes refresh tokens and sets must-change on next login.',
  })
  @ApiBody({ type: BulkResetPasswordBodyDto })
  async resetPasswordsBulk(
    @Body() dto: BulkResetPasswordBodyDto,
    @CurrentUser() user: JwtUser,
    @Req() req: { headers?: Record<string, unknown>; id?: string },
  ) {
    await this.assertCanMutateStaffDirectory(user);
    const out = await this.usersService.resetPasswordsBulk(
      dto.userIds,
      dto.newPassword,
      user.userId,
      user.role,
    );
    this.logger.log(
      JSON.stringify({
        event: 'staff.password_reset_bulk',
        requestId: this.requestId(req),
        actorUserId: user.userId,
        actorRole: user.role,
        updated: out.updated,
      }),
    );
    return out;
  }

  @Post(':id/reset-password')
  @Permissions(AppPermission.MANAGE_USERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: `Reset user password (${APP_BRAND})`,
    description:
      'MANAGE_USERS. Sets a temporary password; user must change it at next login.',
  })
  @ApiBody({ type: ResetPasswordBodyDto })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordBodyDto,
    @CurrentUser() user: JwtUser,
    @Req() req: { headers?: Record<string, unknown>; id?: string },
  ) {
    await this.assertCanMutateStaffDirectory(user);
    const row = await this.usersService.resetPassword(
      id,
      dto.newPassword,
      user.userId,
      user.role,
    );
    this.logger.log(
      JSON.stringify({
        event: 'staff.password_reset',
        requestId: this.requestId(req),
        actorUserId: user.userId,
        actorRole: user.role,
        targetUserId: row.id,
      }),
    );
    return row;
  }

  @Get()
  @ApiOperation({ summary: `List users (${APP_BRAND})` })
  async findAll(@CurrentUser() user: JwtUser) {
    await this.assertCanViewStaffDirectory(user);
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: `Get user by id (${APP_BRAND})` })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtUser) {
    await this.assertCanViewStaffDirectory(user);
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: `Update user (${APP_BRAND})` })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtUser,
    @Req() req: { headers?: Record<string, unknown>; id?: string },
  ) {
    await this.assertCanMutateStaffDirectory(user);
    const row = await this.usersService.update(id, dto);
    this.logger.log(
      JSON.stringify({
        event: 'staff.update',
        requestId: this.requestId(req),
        actorUserId: user.userId,
        actorRole: user.role,
        targetUserId: row.id,
        targetRole: row.safariRole,
      }),
    );
    return row;
  }

  /**
   * Soft-lock a user account (OWNER only for institutional read-only GM policy).
   */
  @Patch(':id/status')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Enable / disable user (${APP_BRAND})`,
    description:
      'OWNER only. Toggles `isActive` without touching role/branch/password.',
  })
  @ApiBody({ type: UpdateUserStatusDto })
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: JwtUser,
    @Req() req: { headers?: Record<string, unknown>; id?: string },
  ) {
    const row = await this.usersService.setActive(id, dto.isActive);
    this.logger.log(
      JSON.stringify({
        event: dto.isActive ? 'staff.enable' : 'staff.disable',
        requestId: this.requestId(req),
        actorUserId: user.userId,
        actorRole: user.role,
        targetUserId: row.id,
        targetRole: row.safariRole,
      }),
    );
    return row;
  }

  /**
   * V19.17 — Payroll registry: update the per-employee salary defaults
   * (`basicMonthlySalary` + `monthlyAllowances`) that seed future
   * payroll rows. OWNER + MANAGER.
   */
  @Patch(':id/salary-defaults')
  @Roles(SafariRole.OWNER, SafariRole.MANAGER)
  @ApiOperation({
    summary: `Update salary defaults (${APP_BRAND})`,
    description:
      'OWNER or MANAGER. Updates `basicMonthlySalary` + `monthlyAllowances`, and optionally `payrollRosterLineOrder`, `bankName`, `bankIban` for the payroll roster / salary transfer.',
  })
  @ApiBody({ type: UpdateSalaryDefaultsDto })
  async updateSalaryDefaults(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalaryDefaultsDto,
    @CurrentUser() user: JwtUser,
    @Req() req: { headers?: Record<string, unknown>; id?: string },
  ) {
    const row = await this.usersService.updateSalaryDefaults(id, dto);
    this.logger.log(
      JSON.stringify({
        event: 'staff.salary_defaults',
        requestId: this.requestId(req),
        actorUserId: user.userId,
        actorRole: user.role,
        targetUserId: row.id,
      }),
    );
    return row;
  }

  /**
   * Hard-delete a user. OWNER only — GENERAL_MANAGER is restricted to
   * the soft-lock endpoint above so that GM cannot wipe out staff
   * records and the audit trail attached to them.
   */
  @Delete(':id')
  @Roles(SafariRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: `Delete user (${APP_BRAND})`,
    description:
      'OWNER only. GENERAL_MANAGER has read-only oversight; account enable/disable is OWNER-only.',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Req() req: { headers?: Record<string, unknown>; id?: string },
  ) {
    const row = await this.usersService.remove(id);
    this.logger.log(
      JSON.stringify({
        event: 'staff.delete',
        requestId: this.requestId(req),
        actorUserId: user.userId,
        actorRole: user.role,
        targetUserId: id,
      }),
    );
    return row;
  }
}
