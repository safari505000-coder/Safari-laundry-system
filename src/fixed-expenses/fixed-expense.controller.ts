import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CreateFixedExpenseDto } from './dto/create-fixed-expense.dto';
import { FixedExpenseService } from './fixed-expense.service';

@ApiTags('fixed-expenses')
@ApiBearerAuth('bearer')
@Controller('fixed-expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FixedExpenseController {
  constructor(private readonly fixedExpenseService: FixedExpenseService) {}

  @Post()
  @Roles(SafariRole.OWNER, SafariRole.MANAGER)
  @ApiOperation({
    summary: `Create recurring fixed expense schedule (${APP_BRAND})`,
  })
  create(@Body() dto: CreateFixedExpenseDto, @CurrentUser() user: JwtUser) {
    return this.fixedExpenseService.create(user.role as SafariRole, dto);
  }

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({ summary: `List fixed expense schedules (${APP_BRAND})` })
  list(@Query('branchId') branchId?: string) {
    return this.fixedExpenseService.list(branchId);
  }
}
