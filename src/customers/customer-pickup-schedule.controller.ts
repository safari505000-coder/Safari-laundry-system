import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CustomerPickupScheduleService } from './customer-pickup-schedule.service';
// HELD (unsafe card capture/charge): SavedCardsService and its endpoints are
// disabled until card tokenization has explicit customer consent and the
// auto-renew charge path has idempotency. See saved-cards.service.ts.
// import { SavedCardsService } from '../payments/saved-cards.service';
import { UpsertPickupScheduleDto } from './dto/upsert-pickup-schedule.dto';
import { ToggleAutoRenewDto } from './dto/toggle-auto-renew.dto';

@ApiTags('customers')
@ApiBearerAuth('bearer')
@Roles(
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.MANAGER,
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
  SafariRole.SUPERVISOR,
  SafariRole.CUSTOMER,
)
@Controller('customers/:customerId')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomerPickupScheduleController {
  constructor(
    private readonly scheduleService: CustomerPickupScheduleService,
    // HELD: re-inject when saved-cards feature is secured (consent + idempotency).
    // private readonly savedCardsService: SavedCardsService,
  ) {}

  private assertAccess(customerId: string, user: JwtUser) {
    const role = (user.role ?? '').trim().toUpperCase();
    if (role === SafariRole.CUSTOMER) {
      if (!user.linkedCustomerId || user.linkedCustomerId !== customerId) {
        throw new ForbiddenException('Cannot access another customer profile');
      }
    }
  }

  // ─── Pickup Schedule Endpoints ────────────────────────────────────

  @Get('pickup-schedule')
  @ApiOperation({ summary: 'Get pickup schedules for a customer' })
  getSchedules(
    @Param('customerId') customerId: string,
    @CurrentUser() user: JwtUser,
  ) {
    this.assertAccess(customerId, user);
    return this.scheduleService.getSchedules(customerId);
  }

  @Post('pickup-schedule')
  @ApiOperation({ summary: 'Create or update a pickup schedule' })
  upsertSchedule(
    @Param('customerId') customerId: string,
    @Body() dto: UpsertPickupScheduleDto,
    @CurrentUser() user: JwtUser,
  ) {
    this.assertAccess(customerId, user);
    return this.scheduleService.upsertSchedule(
      customerId,
      dto.dayOfWeek,
      dto.timeWindow,
      dto.isActive ?? true,
    );
  }

  @Delete('pickup-schedule/:dayOfWeek')
  @ApiOperation({ summary: 'Delete a pickup schedule for a specific day' })
  deleteSchedule(
    @Param('customerId') customerId: string,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @CurrentUser() user: JwtUser,
  ) {
    this.assertAccess(customerId, user);
    return this.scheduleService.deleteSchedule(customerId, dayOfWeek);
  }

  // ─── Auto-Renew Toggle Endpoint ───────────────────────────────────

  @Patch('auto-renew')
  @ApiOperation({ summary: 'Toggle subscription auto-renewal' })
  toggleAutoRenew(
    @Param('customerId') customerId: string,
    @Body() dto: ToggleAutoRenewDto,
    @CurrentUser() user: JwtUser,
  ) {
    this.assertAccess(customerId, user);
    return this.scheduleService.toggleAutoRenew(customerId, dto.autoRenew);
  }

  // ─── Saved Payment Cards Endpoints ────────────────────────────────
  // HELD (unsafe): these endpoints depend on SavedCardsService, which is part
  // of the card-capture/charge feature being withheld until consent +
  // idempotency are in place. The SavedPaymentCard table exists (empty) but no
  // capture/charge path is active. Re-enable together with the secured cron.
  //
  // @Get('saved-cards')
  // @ApiOperation({ summary: 'Get saved payment cards for a customer' })
  // getSavedCards(
  //   @Param('customerId') customerId: string,
  //   @CurrentUser() user: JwtUser,
  // ) {
  //   this.assertAccess(customerId, user);
  //   return this.savedCardsService.getSavedCards(customerId);
  // }
  //
  // @Delete('saved-cards/:cardId')
  // @ApiOperation({ summary: 'Delete a saved payment card' })
  // deleteCard(
  //   @Param('customerId') customerId: string,
  //   @Param('cardId') cardId: string,
  //   @CurrentUser() user: JwtUser,
  // ) {
  //   this.assertAccess(customerId, user);
  //   return this.savedCardsService.deleteCard(customerId, cardId);
  // }
}
