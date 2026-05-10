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
import {
  CreateLoanDto,
  RejectLoanDto,
} from './dto/create-loan.dto';
import { DeductLoanDto } from './dto/deduct-loan.dto';
import { ListLoansQueryDto } from './dto/list-loans-query.dto';
import { mapLoanResponse, mapLoanResponses } from './loans.response';
import { LoansService } from './loans.service';

/**
 * Stage-D employee loans endpoints.
 *
 *   POST   /api/loans              — employee requests (or approver raises for staff)
 *   GET    /api/loans              — approvers see all; staff see own
 *   GET    /api/loans/mine         — self
 *   GET    /api/loans/:id          — single row
 *   PATCH  /api/loans/:id/approve  — approver moves to ACTIVE
 *   PATCH  /api/loans/:id/reject   — approver rejects (requires reason)
 */
@ApiTags('loans')
@ApiBearerAuth('bearer')
@Controller('loans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  // V19.4 — CALL_CENTER removed from every /api/loans route. Loans are
  // no longer part of the call-centre surface (nav pruned + access-
  // matrix `hr.loans.mine` tightened). Keeping the role on the backend
  // would let a CC JWT still POST/GET loans via direct curl; that is
  // the exact gap we are closing.
  @Post()
  @Roles(
    SafariRole.OWNER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.DRIVER,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({ summary: `Create loan request (${APP_BRAND})` })
  async create(@Body() dto: CreateLoanDto, @CurrentUser() user: JwtUser) {
    const row = await this.loans.create(
      user.role as SafariRole,
      user.userId,
      dto,
    );
    return mapLoanResponse(row);
  }

  @Get()
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: `List loans (${APP_BRAND})` })
  async list(@Query() q: ListLoansQueryDto, @CurrentUser() user: JwtUser) {
    const rows = await this.loans.list(
      user.role as SafariRole,
      user.userId,
      q,
    );
    return mapLoanResponses(rows);
  }

  @Get('mine')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.DRIVER,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({ summary: `My loans (${APP_BRAND})` })
  async mine(@CurrentUser() user: JwtUser) {
    const rows = await this.loans.listMine(user.userId);
    return mapLoanResponses(rows);
  }

  @Get(':id')
  @Roles(
    SafariRole.OWNER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.MANAGER,
    SafariRole.ACCOUNTANT,
    SafariRole.DRIVER,
    SafariRole.SUPERVISOR,
    SafariRole.VIEWER,
  )
  @ApiOperation({ summary: `Fetch single loan row (${APP_BRAND})` })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    const row = await this.loans.findOne(
      user.role as SafariRole,
      user.userId,
      id,
    );
    return mapLoanResponse(row);
  }

  @Patch(':id/approve')
  @Roles(SafariRole.OWNER, SafariRole.ACCOUNTANT)
  @ApiOperation({ summary: `Approve loan (${APP_BRAND})` })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    const row = await this.loans.approve(
      user.role as SafariRole,
      user.userId,
      id,
    );
    return mapLoanResponse(row);
  }

  @Patch(':id/reject')
  @Roles(SafariRole.OWNER, SafariRole.ACCOUNTANT)
  @ApiOperation({ summary: `Reject loan (${APP_BRAND})` })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectLoanDto,
    @CurrentUser() user: JwtUser,
  ) {
    const row = await this.loans.reject(
      user.role as SafariRole,
      user.userId,
      id,
      dto.reason,
    );
    return mapLoanResponse(row);
  }

  /**
   * V19.19 — OWNER posts a manual deduction against an ACTIVE loan.
   */
  @Post(':id/deduct')
  @Roles(SafariRole.OWNER)
  @ApiOperation({
    summary: `Manually deduct an instalment from an ACTIVE loan (${APP_BRAND})`,
    description:
      'OWNER only. Clamps to remaining and marks SETTLED when it reaches zero.',
  })
  async deduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeductLoanDto,
    @CurrentUser() user: JwtUser,
  ) {
    const row = await this.loans.deductManual(
      user.role as SafariRole,
      id,
      dto.amount,
      dto.note,
    );
    return mapLoanResponse(row);
  }
}
