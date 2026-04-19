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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CAN_MANAGE_STAFF } from '../auth/capabilities';
import { APP_BRAND } from '../common/constants/branding';
import { PermissionsService } from '../permissions/permissions.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('bearer')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private async assertCanManageStaff(user: JwtUser): Promise<void> {
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
    await this.assertCanManageStaff(user);
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

  @Get()
  @ApiOperation({ summary: `List users (${APP_BRAND})` })
  async findAll(@CurrentUser() user: JwtUser) {
    await this.assertCanManageStaff(user);
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: `Get user by id (${APP_BRAND})` })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtUser) {
    await this.assertCanManageStaff(user);
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
    await this.assertCanManageStaff(user);
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

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: `Delete user (${APP_BRAND})` })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Req() req: { headers?: Record<string, unknown>; id?: string },
  ) {
    await this.assertCanManageStaff(user);
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
