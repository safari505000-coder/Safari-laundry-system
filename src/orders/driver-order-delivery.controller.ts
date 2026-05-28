import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReturnToBranchDto } from './dto/return-to-branch.dto';
import { OrderDeliveryService } from './order-delivery.service';

@ApiTags('driver-delivery')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.DRIVER, SafariRole.MANAGER, SafariRole.SUPERVISOR)
@Controller('driver/orders')
export class DriverOrderDeliveryController {
  constructor(private readonly delivery: OrderDeliveryService) {}

  @Post(':id/start-delivery')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark invoice as out for delivery (driver scan flow)' })
  startDelivery(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.delivery.startDelivery(id, user.userId, user.role);
  }

  @Post(':id/complete-delivery')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm customer received the order' })
  completeDelivery(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.delivery.completeDelivery(id, user.userId, user.role);
  }

  @Post(':id/return-to-branch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark order returned to branch (failed delivery)' })
  returnToBranch(
    @Param('id') id: string,
    @Body() dto: ReturnToBranchDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.delivery.returnToBranch(id, user.userId, user.role, dto);
  }
}
