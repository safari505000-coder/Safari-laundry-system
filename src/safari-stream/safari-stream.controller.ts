import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { SafariStreamService, type SafariStreamSnapshotDto } from './safari-stream.service';

@ApiTags('safari-stream')
@ApiBearerAuth('bearer')
@Controller('safari-stream')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SafariStreamController {
  constructor(private readonly safariStream: SafariStreamService) {}

  @Get('snapshot')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.DRIVER,
    SafariRole.WORKER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `SafariStream snapshot (${APP_BRAND})`,
    description:
      'Global context pipe: authenticated user identity, institutional permission keys, and (for DRIVER) wallet / pending deposit / debt radar figures for live UI.',
  })
  @ApiOkResponse({ description: 'Snapshot payload' })
  snapshot(@CurrentUser() user: JwtUser): Promise<SafariStreamSnapshotDto> {
    return this.safariStream.buildSnapshot(user.userId, user.role);
  }
}
