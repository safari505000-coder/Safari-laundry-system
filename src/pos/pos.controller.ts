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
import { PosCheckoutDto } from '../orders/dto/pos-checkout.dto';
import { OrdersService } from '../orders/orders.service';
import { PosCreateCustomerDto } from './dto/pos-create-customer.dto';
import { PosService } from './pos.service';

@ApiTags('pos')
@ApiBearerAuth('bearer')
@Controller('pos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.DRIVER)
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
      'Cash/KNET/wallet: creates COMPLETED order and wallet settlement. PAYMENT_LINK: creates PENDING order, returns paymentLink URL; gateway callback completes the sale.',
  })
  posCheckout(@Body() dto: PosCheckoutDto, @CurrentUser() user: JwtUser) {
    return this.ordersService.posCheckout(user.userId, dto);
  }
}
