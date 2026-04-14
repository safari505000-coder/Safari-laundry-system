import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { PosCreateCustomerDto } from './dto/pos-create-customer.dto';
import { PosService } from './pos.service';

@ApiTags('pos')
@ApiBearerAuth('bearer')
@Controller('pos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.DRIVER)
export class PosController {
  constructor(private readonly posService: PosService) {}

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
}
