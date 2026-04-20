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
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

/**
 * Stage-F Cosmetic — Purchase Order endpoints.
 *
 * RBAC (mirrors inventory stock-in policy):
 *  - OWNER, GENERAL_MANAGER, ACCOUNTANT → create / send / cancel / receive
 *  - MANAGER                            → read-only (pre-arrival visibility
 *                                         for branch managers)
 */
@ApiTags('purchase-orders')
@ApiBearerAuth('bearer')
@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  @ApiOperation({ summary: `List purchase orders (${APP_BRAND})` })
  list(@Query() q: ListPurchaseOrdersQueryDto) {
    return this.service.list(q);
  }

  @Get(':id')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.MANAGER,
  )
  @ApiOperation({ summary: `Get purchase order details (${APP_BRAND})` })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({ summary: `Create a DRAFT purchase order (${APP_BRAND})` })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create(dto, user.userId);
  }

  @Post(':id/send')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({ summary: `Transition DRAFT → SENT (${APP_BRAND})` })
  send(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.send(id, user.userId);
  }

  @Post(':id/cancel')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({ summary: `Cancel a purchase order (${APP_BRAND})` })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: { reason?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.cancel(id, dto?.reason, user.userId);
  }

  @Post(':id/receive')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: `Record a delivery against a PO (${APP_BRAND})`,
    description:
      'Partial or full receipt. Creates StockMovement(STOCK_IN) rows via InventoryService and transitions PO to PARTIALLY_RECEIVED / RECEIVED.',
  })
  receive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReceivePurchaseOrderDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.receive(id, dto, user.userId);
  }
}
