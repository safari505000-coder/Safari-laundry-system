import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderQuickDto } from './dto/create-order-quick.dto';
import { ManagerDashboardDto } from './dto/manager-dashboard.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth('bearer')
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('manager-dashboard')
  @UseGuards(RolesGuard)
  @Roles(
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.SUPERVISOR,
    SafariRole.ACCOUNTANT,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Manager dashboard — orders & driver contribution (${APP_BRAND})`,
    description:
      'Active pipeline count, completed revenue, and per-driver completed volume/revenue (driver-led business). OWNER/MANAGER only.',
  })
  getManagerDashboard(): Promise<ManagerDashboardDto> {
    return this.ordersService.getManagerDashboard();
  }

  @Post('quick')
  @UseGuards(RolesGuard)
  @Roles(SafariRole.DRIVER)
  @ApiOperation({
    summary: `Quick create order — driver (${APP_BRAND})`,
    description:
      'Mobile-first: **Kuwait mobile** (+965 optional, 8 digits starting 5/6/9), **totalPrice > 0**, optional **lineItems** (Σ qty×price must equal total). Auto-assigned to the authenticated driver.',
  })
  createQuick(@Body() dto: CreateOrderQuickDto, @CurrentUser() user: JwtUser) {
    return this.ordersService.createQuick(user.userId, dto);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(SafariRole.MANAGER, SafariRole.CALL_CENTER)
  @ApiOperation({
    summary: `Create order — back office (${APP_BRAND})`,
    description:
      'Same validation as driver quick create: Kuwait phone, **totalPrice > 0**, **EXPRESS|NORMAL**, optional **lineItems** with total reconciliation. Optional driver assignment. Branch managers and call center only (drivers use POST /orders/quick).',
  })
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.createAsManager(dto);
  }

  @Get()
  @ApiOperation({
    summary: `List orders (${APP_BRAND})`,
    description:
      'OWNER/MANAGER: entire fleet. DRIVER: only orders assigned to them (including self-created).',
  })
  findAll(@CurrentUser() user: JwtUser) {
    return this.ordersService.findAllForActor(user.userId, user.role);
  }

  @Get('collections/unpaid-online')
  @UseGuards(RolesGuard)
  @Roles(SafariRole.CALL_CENTER, SafariRole.OWNER)
  @ApiOperation({
    summary: `Debt-Tracking — every unpaid invoice (${APP_BRAND})`,
    description:
      'V1.6.5: Financial Oversight Report feeding the Collections debt table. Returns ALL non-canceled orders with cashStatus=UNPAID, regardless of payment method (Cash, KNET, Payment Link, Online, Wallet, Debt-on-account). Pass `?branchId=<uuid>` to scope the table to a single branch — the Red-card KPI uses the same scope so the footer sum equals the KPI to the last fils. Amounts are serialized with 3 decimals (KWD standard).',
  })
  listCollectionsUnpaidOnline(@Query('branchId') branchId?: string) {
    // V1.6.5 — mirror the operations-summary parser: empty / non-UUID
    // values collapse to global so a stray "?branchId=" doesn't 500.
    const raw = (branchId ?? '').trim();
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const scoped = raw && uuidRe.test(raw) ? raw : null;
    return this.ordersService.listUnpaidCollectionOrders(scoped);
  }

  @Get('driver/pending-invoices')
  @UseGuards(RolesGuard)
  @Roles(SafariRole.DRIVER)
  @ApiOperation({
    summary: `Driver Field Collection Tracker — my unpaid invoices (${APP_BRAND})`,
    description:
      'V3.8 (Driver island): READ-ONLY list of the authenticated driver\'s own unpaid, non-canceled orders. Filter: `driverId === me` AND `cashStatus === UNPAID`. Sort: `createdAt DESC`. Amounts serialized at 3 decimals (KWD standard). Strictly isolated from the Call Center debt-recovery workflow — no WhatsApp / Payment-Link side-effects, and the aggregated KPIs in `/api/call-center/operations-summary` remain untouched.',
  })
  listDriverPendingInvoices(@CurrentUser() user: JwtUser) {
    return this.ordersService.listDriverPendingInvoices(user.userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: `Get order by id (${APP_BRAND})`,
    description:
      'OWNER/MANAGER: any order. DRIVER: only if they are the assigned driver.',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ordersService.findOneForActor(id, user.userId, user.role);
  }

  @Patch(':id/assign-driver')
  @UseGuards(RolesGuard)
  @Roles(SafariRole.MANAGER, SafariRole.SUPERVISOR)
  @ApiOperation({
    summary: `Assign or reassign driver (${APP_BRAND})`,
    description:
      'Branch manager or supervisor. Not allowed when order is COMPLETED or CANCELED.',
  })
  assignDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDriverDto,
  ) {
    return this.ordersService.assignDriver(id, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: `Update order status / notes (${APP_BRAND})`,
    description:
      '**State machine**: e.g. COMPLETED only from OUT_FOR_DELIVERY; PICKED_UP requires an assigned driver. DRIVER: own orders only. MANAGER/SUPERVISOR: any order. OWNER and other roles: read-only (no updates).',
  })
  updateOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ordersService.updateOrder(id, dto, user.userId, user.role);
  }
}
