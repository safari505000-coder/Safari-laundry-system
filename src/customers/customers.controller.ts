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
import { APP_BRAND } from '../common/constants/branding';
import { CreateCustomerQuickDto } from './dto/create-customer-quick.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiBearerAuth('bearer')
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Customer directory (${APP_BRAND})`,
  })
  list(@Query('q') q?: string) {
    return this.customersService.list(q);
  }

  @Get('resolve-incoming-phone')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
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
    SafariRole.MANAGER,
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

  @Get(':id/profile')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Customer profile (core + financial snapshot) (${APP_BRAND})`,
    description:
      'Core profile is served by CustomerCoreService; financial snapshot is fetched via DebtService + SubscriptionService (no finance logic inside customers).',
  })
  getProfile(@Param('id') id: string) {
    return this.customersService.getProfileWithFinancials(id);
  }

  @Patch(':id')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
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
}
