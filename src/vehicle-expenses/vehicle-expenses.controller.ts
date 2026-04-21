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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import { CreateVehicleExpenseDto } from './dto/create-vehicle-expense.dto';
import { UpdateVehicleExpenseStatusDto } from './dto/update-vehicle-expense-status.dto';
import { VehicleExpensesQueryDto } from './dto/vehicle-expenses-query.dto';
import { VehicleExpensesService } from './vehicle-expenses.service';

/**
 * V19.10 — Fleet / vehicle expenses.
 *
 *   FLEET_SUPERVISOR  — logs an expense (receipt mandatory) and lists own.
 *   ACCOUNTANT        — approves / rejects the queue (with reason).
 *   OWNER / GM        — read the queue and aggregated report for audit.
 */
@ApiTags('vehicle-expenses')
@ApiBearerAuth('bearer')
@Controller('vehicle-expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehicleExpensesController {
  constructor(private readonly service: VehicleExpensesService) {}

  @Post()
  @Roles(SafariRole.FLEET_SUPERVISOR)
  @ApiOperation({
    summary: `Submit a vehicle expense (${APP_BRAND})`,
    description:
      'Fleet Supervisor only. Receipt photo is MANDATORY. Row starts at PENDING_ACCOUNTANT.',
  })
  create(
    @Body() dto: CreateVehicleExpenseDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create(user.userId, user.role as SafariRole, dto);
  }

  @Get()
  @Roles(
    SafariRole.FLEET_SUPERVISOR,
    SafariRole.ACCOUNTANT,
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
  )
  @ApiOperation({
    summary: `List vehicle expenses (${APP_BRAND})`,
    description:
      'Fleet Supervisor sees only own rows; Accountant / Owner / GM see all.',
  })
  list(
    @Query() q: VehicleExpensesQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listForUser(user.userId, user.role as SafariRole, q);
  }

  @Get('pending-approval')
  @Roles(SafariRole.ACCOUNTANT, SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: `Pending vehicle-expense queue (${APP_BRAND})` })
  listPendingApproval(@CurrentUser() user: JwtUser) {
    return this.service.listPendingApproval(user.role as SafariRole);
  }

  @Get('report')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @ApiOperation({ summary: `Aggregated vehicle-expense report (${APP_BRAND})` })
  report(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getReport(user.role as SafariRole, { from, to });
  }

  @Patch(':id/status')
  @Roles(SafariRole.ACCOUNTANT)
  @ApiOperation({
    summary: `Approve / reject a vehicle expense (${APP_BRAND})`,
    description: 'Accountant only. REJECTED requires a reason.',
  })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleExpenseStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateStatus(
      id,
      user.role as SafariRole,
      user.userId,
      dto,
    );
  }
}
