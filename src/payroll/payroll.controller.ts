import {
  Body,
  Controller,
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
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { PayrollQueryDto } from './dto/payroll-query.dto';
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

  @Get(':id')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.DRIVER,
    SafariRole.CALL_CENTER,
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
