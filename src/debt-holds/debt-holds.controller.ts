import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { DebtHoldsService } from './debt-holds.service';
import { CreateManualHoldDto } from './dto/create-manual-hold.dto';
import { ListDebtHoldsDto } from './dto/list-debt-holds.dto';

@ApiTags('debt-holds')
@ApiBearerAuth('bearer')
@Controller('debt-holds')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DebtHoldsController {
  constructor(private readonly service: DebtHoldsService) {}

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
    SafariRole.DRIVER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `List debt holds (${APP_BRAND})`,
    description:
      'Admin roles see everyone; employees only their own holds.',
  })
  list(@Query() q: ListDebtHoldsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(user.role as SafariRole, user.userId, q);
  }

  @Get('preview/:employeeUserId')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  @ApiOperation({
    summary: `Preview the debt-hold slip for an employee (${APP_BRAND})`,
  })
  preview(
    @Param('employeeUserId', ParseUUIDPipe) employeeUserId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.previewForEmployee(
      user.role as SafariRole,
      employeeUserId,
    );
  }

  @Post('manual')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Create a manual debt hold (${APP_BRAND})`,
    description:
      'OWNER + GENERAL_MANAGER only. Withholds a one-off amount from the employee outside the automatic open-customer-debt computation.',
  })
  createManual(
    @Body() dto: CreateManualHoldDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.createManualHold(user.role as SafariRole, dto);
  }

  @Post(':id/release')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Force-release a debt hold (${APP_BRAND})`,
    description:
      'OWNER + GENERAL_MANAGER only. V19.17: flips the hold to RELEASED, marking it as eligible for a SEPARATE voucher payout (no longer bundled into the next payroll).',
  })
  release(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.releaseManualHold(user.role as SafariRole, id);
  }

  @Post(':id/disburse')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({
    summary: `Stamp a released hold as disbursed (${APP_BRAND})`,
    description:
      'OWNER + GENERAL_MANAGER only. V19.17: records that the RELEASED hold has actually been paid out to the employee as a standalone voucher, setting `disbursedAt` + `disbursedById`.',
  })
  disburse(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.markDisbursed(
      user.role as SafariRole,
      user.userId,
      id,
    );
  }
}
