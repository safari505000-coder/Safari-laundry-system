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
import { UpdateExpenseStatusDto } from './dto/update-expense-status.dto';

@ApiTags('expenses')
@ApiBearerAuth('bearer')
@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @Roles(SafariRole.MANAGER, SafariRole.DRIVER)
  @ApiOperation({
    summary: `Record branch expense (${APP_BRAND})`,
    description:
      'MANAGER or DRIVER (field). Categories: SOAP, FUEL, MISC. New rows are PENDING_ACCOUNTANT until approved.',
  })
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: JwtUser) {
    return this.expensesService.create(
      user.userId,
      user.role as SafariRole,
      dto,
    );
  }

  @Get()
  @Roles(SafariRole.MANAGER, SafariRole.ACCOUNTANT, SafariRole.OWNER, SafariRole.DRIVER)
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
      q.status,
    );
  }

  @Get('pending-approval')
  @Roles(SafariRole.ACCOUNTANT, SafariRole.OWNER)
  @ApiOperation({
    summary: `Pending expense approvals (${APP_BRAND})`,
  })
  listPendingApproval(@CurrentUser() user: JwtUser) {
    return this.expensesService.listPendingApproval(user.role as SafariRole);
  }

  @Patch(':id/status')
  @Roles(SafariRole.ACCOUNTANT, SafariRole.OWNER)
  @ApiOperation({
    summary: `Approve/Reject/Audit expense (${APP_BRAND})`,
  })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.expensesService.updateStatus(
      id,
      user.role as SafariRole,
      dto.status,
    );
  }
}
