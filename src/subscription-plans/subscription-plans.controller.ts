import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { SubscriptionPlansService } from './subscription-plans.service';

@ApiTags('subscription-plans')
@ApiBearerAuth('bearer')
@Controller('subscription-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionPlansController {
  constructor(
    private readonly subscriptionPlansService: SubscriptionPlansService,
  ) {}

  @Post()
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Create subscription plan (${APP_BRAND})`,
    description:
      'OWNER only. Defines list price and wallet credit granted on activation.',
  })
  create(@Body() dto: CreateSubscriptionPlanDto) {
    return this.subscriptionPlansService.create(dto);
  }

  @Get()
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: `List subscription plans (${APP_BRAND})` })
  findAll() {
    return this.subscriptionPlansService.findAll();
  }

  @Get(':id')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: `Get subscription plan (${APP_BRAND})` })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptionPlansService.findOne(id);
  }

  @Patch(':id')
  @Roles(SafariRole.OWNER)
  @ApiOperation({ summary: `Update subscription plan (${APP_BRAND})` })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionPlanDto,
  ) {
    return this.subscriptionPlansService.update(id, dto);
  }

  @Delete(':id')
  @Roles(SafariRole.OWNER)
  @ApiOperation({ summary: `Delete subscription plan (${APP_BRAND})` })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptionPlansService.remove(id);
  }
}
