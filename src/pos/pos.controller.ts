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
import { PosCheckoutBundleDto } from '../orders/dto/pos-checkout-bundle.dto';
import { PosCheckoutDto } from '../orders/dto/pos-checkout.dto';
import { OrdersService } from '../orders/orders.service';
import { PosCreateCustomerDto } from './dto/pos-create-customer.dto';
import { PosService } from './pos.service';

@ApiTags('pos')
@ApiBearerAuth('bearer')
@Controller('pos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.DRIVER, SafariRole.MANAGER)
export class PosController {
  constructor(
    private readonly posService: PosService,
    private readonly ordersService: OrdersService,
  ) {}

  @Get('customers/search')
  @ApiOperation({
    summary: `Search customers — driver POS (${APP_BRAND})`,
  })
  searchCustomers(@Query('q') q: string) {
    return this.posService.searchCustomers(q ?? '');
  }

  @Get('customers/cache')
  @ApiOperation({
    summary: `Hydrate offline IndexedDB snapshot — DRIVER/MANAGER POS (${APP_BRAND})`,
    description:
      'Returns newest customers (cap ~15k) with wallet balance/debt — same projection as `/customers/search`.',
  })
  listCustomersForOfflineCache() {
    return this.posService.listCustomersForOfflineDirectory();
  }

  @Post('customers')
  @ApiOperation({
    summary: `Create customer — driver POS (${APP_BRAND})`,
    description: 'Name + mobile only; used for quick checkout.',
  })
  createCustomer(@Body() dto: PosCreateCustomerDto) {
    return this.posService.createCustomer(dto);
  }

  @Get('customers/:customerId/billing')
  @ApiOperation({
    summary: `Customer subscription & wallet — POS (${APP_BRAND})`,
    description:
      'Prepaid balance (subscription credit), debt, and last activated plan name for checkout UI.',
  })
  getCustomerBilling(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.posService.getCustomerBillingProfile(customerId);
  }

  @Post('checkout')
  @ApiOperation({
    summary: `Complete POS sale — wallet + payment method (${APP_BRAND})`,
    description:
      'Cash/KNET/DEBT/wallet: creates COMPLETED order and wallet settlement. ONLINE: creates PENDING order, returns paymentLink URL; gateway callback completes the sale.',
  })
  posCheckout(@Body() dto: PosCheckoutDto, @CurrentUser() user: JwtUser) {
    return this.ordersService.posCheckout(user.userId, dto);
  }

  @Post('checkout-bundle')
  @ApiOperation({
    summary: `Multi-invoice POS — one hosted payment for several orders (${APP_BRAND})`,
    description:
      'Creates multiple PENDING orders linked to one PosPaymentBundle; returns a single paymentLink for the combined total. Gateway callback references the bundle id.',
  })
  posCheckoutBundle(
    @Body() dto: PosCheckoutBundleDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ordersService.posCheckoutBundle(user.userId, dto);
  }
}
