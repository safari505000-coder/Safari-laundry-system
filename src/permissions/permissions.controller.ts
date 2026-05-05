import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { PermissionKeyDto } from './dto/permission-key.dto';
import { PermissionsService } from './permissions.service';

@ApiTags('permissions')
@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @ApiOperation({ summary: `List all permission keys (${APP_BRAND})` })
  list() {
    return this.permissionsService.listPermissions();
  }

  @Get('roles/:roleId')
  @ApiOperation({ summary: `Get role and its permissions (${APP_BRAND})` })
  getRole(@Param('roleId', ParseUUIDPipe) roleId: string) {
    return this.permissionsService.getRoleWithPermissions(roleId);
  }

  @Post('roles/:roleId/grant')
  @ApiOperation({ summary: `Grant a permission to a role (${APP_BRAND})` })
  grant(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: PermissionKeyDto,
  ) {
    return this.permissionsService.grantToRole(roleId, dto);
  }

  @Post('roles/:roleId/revoke')
  @ApiOperation({ summary: `Revoke a permission from a role (${APP_BRAND})` })
  revoke(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: PermissionKeyDto,
  ) {
    return this.permissionsService.revokeFromRole(roleId, dto);
  }
}
