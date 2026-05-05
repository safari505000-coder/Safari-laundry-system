import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permissions } from '../auth/permissions/permissions.decorator';
import { AppPermission } from '../auth/permissions/permissions.enum';
import { APP_BRAND } from '../common/constants/branding';
import { CreateCustomerQuickDto } from './dto/create-customer-quick.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { BlockCustomerDto, UnblockCustomerDto } from './dto/block-customer.dto';
import { CustomersService } from './customers.service';
import { Customer360Service } from './customer-360.service';
import { CustomerBlockingService } from '../common/services/customer-blocking.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';

@ApiTags('customers')
@ApiBearerAuth('bearer')
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly customer360: Customer360Service,
    private readonly customerBlocking: CustomerBlockingService,
  ) {}

  @Get()
  @Permissions(AppPermission.VIEW_CUSTOMERS)
  @ApiOperation({
    summary: `Customer directory (${APP_BRAND})`,
  })
  list(@Query('q') q: string | undefined, @CurrentUser() user: JwtUser) {
    return this.customersService.list(q, user.role);
  }

  @Get('resolve-incoming-phone')
  @Permissions(AppPermission.VIEW_CUSTOMERS)
  @ApiOperation({
    summary: 'Resolve caller ID (PBX) to a single customer when possible',
  })
  resolveIncomingPhone(@Query('phone') phone?: string) {
    return this.customersService.resolveIncomingPhone(phone ?? '');
  }

  @Post()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.SUPERVISOR,
  )
  @ApiOperation({
    summary: 'Create customer (minimal — Call Center / CTI handoff)',
  })
  createQuick(@Body() dto: CreateCustomerQuickDto) {
    return this.customersService.createQuick(dto);
  }

  @Get(':customerId/360')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.CUSTOMER,
  )
  @ApiOperation({
    summary: `Customer 360 (${APP_BRAND})`,
    description:
      'Unified snapshot: financials, subscriptions, internal score/insights for call center; sanitized presentation for CUSTOMER role. View mode is derived from JWT only.',
  })
  async getCustomer360(
    @Param('customerId') customerId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.customer360.get360(customerId, user);
  }

  @Get(':id/profile')
  @Permissions(AppPermission.VIEW_CUSTOMERS)
  @ApiOperation({
    summary: `Customer profile (core + financial snapshot) (${APP_BRAND})`,
    description:
      'Core profile is served by CustomerCoreService; financial snapshot is fetched via DebtService + SubscriptionService (no finance logic inside customers).',
  })
  getProfile(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.customersService.getProfileWithFinancials(id, user.role);
  }

  @Patch(':id')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.SUPERVISOR,
  )
  @ApiOperation({
    summary: `Update customer contact profile (${APP_BRAND})`,
  })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  /**
   * V19.x — Manual customer block by a CALL_CENTER agent.
   *
   * The customer is marked `isBlocked=true`. From that moment forward,
   * EVERY route protected by `CustomerBlockGuard` (orders, POS, future
   * dispatches) refuses to operate on this customer until an explicit
   * `/unblock` call clears the flag. The action is recorded in
   * `audit_logs.action = 'CUSTOMER_BLOCKED'` with `source =
   * 'CALL_CENTER_MANUAL'`.
   *
   * Idempotent: re-blocking an already-blocked customer is a no-op
   * (no extra audit row).
   */
  @Post(':id/block')
  @Permissions(AppPermission.MANAGE_CUSTOMER_BLOCK)
  @ApiOperation({
    summary: 'Block customer (manual — call center)',
  })
  block(
    @Param('id') id: string,
    @Body() dto: BlockCustomerDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.customerBlocking.manualBlock({
      customerId: id,
      reason: dto.reason,
      actorUserId: user.userId,
      actorRole: user.role,
    });
  }

  /**
   * V19.x — Manual customer unblock. Clears `isBlocked`, `blockReason`
   * and `blockedAt` and writes a `CUSTOMER_UNBLOCKED` audit row even
   * when the customer was already unblocked (intent-recording).
   */
  @Post(':id/unblock')
  @Permissions(AppPermission.MANAGE_CUSTOMER_BLOCK)
  @ApiOperation({
    summary: 'Unblock customer (manual — call center)',
  })
  unblock(
    @Param('id') id: string,
    @Body() dto: UnblockCustomerDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.customerBlocking.manualUnblock({
      customerId: id,
      reason: dto.reason ?? null,
      actorUserId: user.userId,
      actorRole: user.role,
    });
  }
}
