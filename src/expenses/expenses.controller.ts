import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpensesService } from './expenses.service';
import { ExpensesQueryDto } from './dto/expenses-query.dto';

@ApiTags('expenses')
@ApiBearerAuth('bearer')
@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @Roles(SafariRole.MANAGER, SafariRole.OWNER)
  @ApiOperation({
    summary: `Record branch expense (${APP_BRAND})`,
    description:
      'MANAGER or OWNER. Categories: SOAP, FUEL, MISC. Deducted from daily cash in closing reports.',
  })
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: JwtUser) {
    return this.expensesService.create(
      user.userId,
      user.role as SafariRole,
      dto,
    );
  }

  @Get()
  @Roles(SafariRole.MANAGER, SafariRole.OWNER)
  @ApiOperation({
    summary: `List expenses in date range (${APP_BRAND})`,
  })
  list(@Query() q: ExpensesQueryDto, @CurrentUser() user: JwtUser) {
    return this.expensesService.listForUser(
      user.userId,
      user.role as SafariRole,
      q.from,
      q.to,
      q.branchId,
    );
  }
}
