/**
 * SystemConfigController — Owner-only operational settings.
 *
 * Surfaces:
 *   GET  /api/system-config       — read current SystemConfig + resolved
 *                                   guardian phone (after DB → env fallback).
 *   POST /api/system-config       — upsert SystemConfig.guardianPhone.
 *                                   Send `{ "guardianPhone": null }` (or
 *                                   `""`) to clear the value.
 *
 * RBAC:
 *   - Class-level `@Roles(OWNER)` runs through `RolesGuard`.
 *   - Each handler ALSO runs an explicit defence-in-depth check
 *     against `JwtUser.role` so a future change to a permission guard
 *     short-circuit cannot silently widen access.
 *
 * SAFETY:
 *   - This controller never reads or writes financial state.
 *   - The phone validation reuses `parseKuwaitMobile965` so any new
 *     consumer of the value gets the canonical normalisation.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  SystemConfigResponseDto,
  UpdateSystemConfigDto,
} from './dto/system-config.dto';
import { SystemConfigService } from './system-config.service';

@ApiTags('system-config')
@ApiBearerAuth('bearer')
@Controller('system-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.OWNER)
export class SystemConfigController {
  constructor(private readonly service: SystemConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Read SystemConfig (Owner only).' })
  @ApiOkResponse({ type: SystemConfigResponseDto })
  async read(@CurrentUser() user: JwtUser): Promise<SystemConfigResponseDto> {
    this.assertOwner(user);
    return this.service.getPublicConfig();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Update SystemConfig (Owner only). Validates Kuwait phone format; pass null/empty to clear.',
  })
  @ApiOkResponse({ type: SystemConfigResponseDto })
  async update(
    @Body() dto: UpdateSystemConfigDto,
    @CurrentUser() user: JwtUser,
  ): Promise<SystemConfigResponseDto> {
    this.assertOwner(user);
    // Normalise undefined → null so the caller can omit the field
    // entirely to clear it without sending an explicit null.
    const incoming = dto.guardianPhone === undefined ? null : dto.guardianPhone;
    await this.service.setGuardianPhone(incoming);
    return this.service.getPublicConfig();
  }

  private assertOwner(user: JwtUser): void {
    if (user.role !== SafariRole.OWNER) {
      throw new ForbiddenException('System config is restricted to OWNER.');
    }
  }
}
