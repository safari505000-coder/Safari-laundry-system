import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CreatePayrollAdhocLineDto } from './dto/create-payroll-adhoc-line.dto';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { PayrollQueryDto } from './dto/payroll-query.dto';
import { UpdatePayrollAdhocLineDto } from './dto/update-payroll-adhoc-line.dto';
import { PayrollService } from './payroll.service';

@ApiTags('payroll')
@ApiBearerAuth('bearer')
@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post()
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.MANAGER)
  @ApiOperation({ summary: `Create payroll line (${APP_BRAND})` })
  create(@Body() dto: CreatePayrollDto, @CurrentUser() user: JwtUser) {
    return this.payrollService.create(user.role as SafariRole, dto);
  }

  @Patch(':id/mark-paid')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.MANAGER)
  @ApiOperation({ summary: `Mark payroll as paid (${APP_BRAND})` })
  markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollService.markPaid(user.role as SafariRole, id);
  }

  /**
   * V19.20 — backfill the loan instalment on a PENDING payroll that
   * was created before the loan→payroll hook existed. Idempotent:
   * only consumes instalments from loans whose
   * `lastDeductionYearMonth IS NULL`. See
   * `LoansService.recalcUnbookedInstalmentsFor` for the reasoning on
   * why we refuse to backdate the high-water mark.
   */
  @Post(':id/recalc-loan')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.MANAGER)
  @ApiOperation({
    summary: `Recalculate loan instalment for a pending payroll (${APP_BRAND})`,
    description:
      'Pulls the scheduled monthly instalment(s) into this payroll row for loans that have never been consumed by a payroll. Only touches PENDING rows.',
  })
  recalcLoan(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollService.recalcLoanDeduction(
      user.role as SafariRole,
      id,
    );
  }

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: `List payroll in date range (${APP_BRAND})` })
  list(@Query() q: PayrollQueryDto, @CurrentUser() user: JwtUser) {
    return this.payrollService.list(
      user.role as SafariRole,
      q.from,
      q.to,
      q.branchId,
    );
  }

  /**
   * V19.28 — manual مسير lines (name + IBAN + amounts) not tied to User.
   */
  @Get('adhoc-lines')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: `List manual payroll roster lines for YYYY-MM` })
  listAdHoc(
    @Query('ym') ym: string,
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollService.listAdHocLines(
      user.role as SafariRole,
      ym,
      branchId,
    );
  }

  @Post('adhoc-lines')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.MANAGER)
  @ApiOperation({ summary: `Create manual payroll roster line` })
  createAdHoc(
    @Body() dto: CreatePayrollAdhocLineDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollService.createAdHocLine(user.role as SafariRole, dto);
  }

  @Patch('adhoc-lines/:id')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.MANAGER)
  @ApiOperation({ summary: `Update manual payroll roster line` })
  updateAdHoc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollAdhocLineDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollService.updateAdHocLine(
      user.role as SafariRole,
      id,
      dto,
    );
  }

  @Delete('adhoc-lines/:id')
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.MANAGER)
  @ApiOperation({ summary: `Delete manual payroll roster line` })
  removeAdHoc(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollService.deleteAdHocLine(user.role as SafariRole, id);
  }

  @Get(':id')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.DRIVER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({
    summary: `Fetch a single payroll row for the A4 payslip (${APP_BRAND})`,
    description:
      'Stage-D — used by the printable payslip. Non-admin roles can only fetch their own payroll rows.',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollService.findOne(
      user.role as SafariRole,
      user.userId,
      id,
    );
  }
}
