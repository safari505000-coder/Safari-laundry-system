import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/permissions/permissions.decorator';
import { AppPermission } from '../auth/permissions/permissions.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CustomerBlockGuard } from '../common/guards/customer-block.guard';
import { APP_BRAND } from '../common/constants/branding';
import { AuditService } from '../common/audit/audit.service';
import { applyScope } from '../common/utils/apply-scope';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderQuickDto } from './dto/create-order-quick.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { ManagerDashboardDto } from './dto/manager-dashboard.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth('bearer')
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly audit: AuditService,
  ) {}

  @Get('manager-dashboard')
  @UseGuards(RolesGuard)
  @Permissions(AppPermission.VIEW_INVOICES, AppPermission.VIEW_REPORTS)
  @ApiOperation({
    summary: `Manager dashboard — orders & driver contribution (${APP_BRAND})`,
    description:
      'Active pipeline count, completed revenue, and per-driver completed volume/revenue (driver-led business). OWNER/MANAGER only.',
  })
  getManagerDashboard(): Promise<ManagerDashboardDto> {
    return this.ordersService.getManagerDashboard();
  }

  @Post('quick')
  @UseGuards(RolesGuard, CustomerBlockGuard)
  @Permissions(AppPermission.CREATE_INVOICE)
  @ApiOperation({
    summary: `Quick create order — driver (${APP_BRAND})`,
    description:
      'Mobile-first: **Kuwait mobile** (+965 optional, 8 digits starting 5/6/9), **totalPrice > 0**, optional **lineItems** (Σ qty×price must equal total). Auto-assigned to the authenticated driver.',
  })
  createQuick(@Body() dto: CreateOrderQuickDto, @CurrentUser() user: JwtUser) {
    return this.ordersService.createQuick(user.userId, dto);
  }

  @Post()
  @UseGuards(RolesGuard, CustomerBlockGuard)
  @Permissions(AppPermission.CREATE_INVOICE)
  @ApiOperation({
    summary: `Create order — back office (${APP_BRAND})`,
    description:
      'Same validation as driver quick create: Kuwait phone, **totalPrice > 0**, **EXPRESS|NORMAL**, optional **lineItems** with total reconciliation. Optional driver assignment. Branch managers only — drivers use POST /orders/quick; Call Center is NOT permitted to issue invoices (Dastur §2, V19.3).',
  })
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ordersService.createAsManager(dto, user.userId);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Permissions(AppPermission.VIEW_INVOICES)
  @ApiOperation({
    summary: `List invoices (${APP_BRAND})`,
    description:
      'V19.22.5 — Invoices page. **OWNER / GENERAL_MANAGER / CC / ACCOUNTANT**: entire fleet. **MANAGER**: branch-scoped (orders whose assigned driver belongs to the manager\'s branch). **DRIVER**: own rows only. Query params (`driverId`, `status`, `posPaymentMethod`, `cashStatus`, `from`, `to`, `q`) layer on top of the role/branch scope.',
  })
  findAll(
    @CurrentUser() user: JwtUser,
    @Query() filters: ListOrdersQueryDto,
  ) {
    if (user.scope === 'BRANCH' && !user.branchId) {
      this.audit.logAudit('PERMISSION_DENIED', user, {
        reason: 'branch_scope_without_branch',
        resource: 'invoices',
      });
      throw new ForbiddenException('Branch scope requires a branch.');
    }
    const scopedFilters = applyScope(user, filters as Record<string, unknown>, {
      branchField: 'branchId',
      userField: 'driverId',
    }) as ListOrdersQueryDto;
    return this.ordersService.findAllForActor(
      user.userId,
      user.role,
      user.branchId,
      scopedFilters,
    );
  }

  @Get('branch-drivers')
  @UseGuards(RolesGuard)
  @Permissions(AppPermission.VIEW_INVOICES)
  @ApiOperation({
    summary: `Drivers for Invoices-page filter (${APP_BRAND})`,
    description:
      'V19.22.5 — Lightweight dropdown source for the Invoices-page driver filter. MANAGER: only drivers attached to their branch. OWNER / GM / CC / ACCOUNTANT: every active DRIVER. Sorted by fullName. DRIVER role receives an empty list (their filter hides the driver dropdown).',
  })
  listBranchDrivers(@CurrentUser() user: JwtUser) {
    return this.ordersService.listInvoiceFilterDrivers(
      user.role,
      user.branchId,
    );
  }

  /**
   * 🔒 SECURITY LOCK - DO NOT MODIFY
   * Unauthorized roles must NEVER access collections or WhatsApp tools.
   */
  @Get('collections/unpaid-online')
  @UseGuards(RolesGuard)
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
  )
  @ApiOperation({
    summary: `Debt-Tracking — every unpaid invoice (${APP_BRAND})`,
    description:
      'V1.6.5: Financial Oversight Report feeding the Collections debt table. Returns ALL non-canceled orders with cashStatus=UNPAID, regardless of payment method (Cash, KNET, Payment Link, Online, Wallet, Debt-on-account). Pass `?branchId=<uuid>` to scope the table to a single branch — the Red-card KPI uses the same scope so the footer sum equals the KPI to the last fils. Amounts are serialized with 3 decimals (KWD standard).',
  })
  listCollectionsUnpaidOnline(
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    // V1.6.5 — mirror the operations-summary parser: empty / non-UUID
    // values collapse to global so a stray "?branchId=" doesn't 500.
    const raw = (branchId ?? '').trim();
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const scoped = raw && uuidRe.test(raw) ? raw : null;
    return this.ordersService.listUnpaidCollectionOrders(scoped, user);
  }

  @Get('stale-quick-risks')
  @UseGuards(RolesGuard)
  @Permissions(AppPermission.AUDIT_INVOICE)
  @ApiOperation({
    summary: `Stale Quick-Capture accountability risks (${APP_BRAND})`,
    description:
      'V19.22.4 — Accountant/Owner watchdog. Returns every Order still in PENDING + UNPAID state **>24h** after creation via the driver Quick-Capture flow. These invoices have a permanent serialNumber but no settlement trail — the driver may already be holding customer cash. Sort: oldest-first. Amounts serialized to KWD 3-decimal.',
  })
  listStaleQuickOrderRisks() {
    return this.ordersService.listStaleQuickOrderRisks();
  }

  @Get('driver/pending-invoices')
  @UseGuards(RolesGuard)
  @Roles(SafariRole.DRIVER)
  @ApiOperation({
    summary: `Driver Field Collection Tracker — my unpaid invoices (${APP_BRAND})`,
    description:
      'V3.8 (Driver island): READ-ONLY list of the authenticated driver\'s own non-canceled orders that still need field follow-up. Filter: `driverId === me` AND (`cashStatus === UNPAID` OR (`posPaymentMethod === DEBT_ON_ACCOUNT` AND FIFO ledger allocation says the invoice still has open debt)). DEBT invoices vanish the moment the customer settles through any channel (hosted link, CC partial-debt payment, office cash recorded by the Accountant) so drivers never chase already-settled paper. Sort: `createdAt DESC`. Amounts serialized at 3 decimals (KWD standard). Strictly isolated from the Call Center debt-recovery workflow — no WhatsApp / Payment-Link side-effects, and the aggregated KPIs in `/api/call-center/operations-summary` remain untouched.',
  })
  listDriverPendingInvoices(@CurrentUser() user: JwtUser) {
    return this.ordersService.listDriverPendingInvoices(user.userId);
  }

  @Post(':id/invoice-share-link')
  @UseGuards(RolesGuard)
  @Permissions(AppPermission.SHARE_INVOICE)
  @ApiOperation({
    summary: `Mint public share URL for the POS invoice (WhatsApp / PDF) (${APP_BRAND})`,
    description:
      'V19.24 — anyone who can GET this order may mint a 7-day link to `/public/invoice/:token` on the web app. Customer saves PDF via the browser. Same visibility rules as GET :id (driver: own order only).',
  })
  async mintInvoiceShareLink(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    await this.ordersService.findOneForActor(id, user.userId, user.role);
    const proto =
      (req.headers['x-forwarded-proto'] as string | undefined) ??
      req.protocol ??
      'http';
    const host = (req.headers['x-forwarded-host'] as string | undefined) ??
      req.headers.host ??
      'localhost:3000';
    const publicBaseUrl =
      process.env.PUBLIC_WEB_APP_URL?.replace(/\/$/, '') ||
      `${proto}://${host}`;
    return this.ordersService.mintInvoiceShareLink(id, publicBaseUrl);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Permissions(AppPermission.VIEW_INVOICES)
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
  @Permissions(AppPermission.UPDATE_OPERATIONAL_DATA)
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
  @UseGuards(RolesGuard)
  @Permissions(AppPermission.UPDATE_INVOICE)
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
