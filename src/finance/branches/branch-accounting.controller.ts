import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type JwtUser,
} from '../../auth/decorators/current-user.decorator';
import { BranchAccountingService } from './branch-accounting.service';

const READ_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
]);

function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const v = new Date(s);
  if (Number.isNaN(v.getTime())) return undefined;
  return v;
}

@Controller('finance/branches')
@UseGuards(JwtAuthGuard)
export class BranchAccountingController {
  constructor(private readonly svc: BranchAccountingService) {}

  @Get('trial-balance')
  async trialBalance(
    @CurrentUser() user: JwtUser,
    @Query('asOf') asOf?: string,
    @Query('sinceDate') sinceDate?: string,
  ) {
    this.assertRead(user);
    return this.svc.trialBalance({
      asOf: parseDate(asOf),
      sinceDate: parseDate(sinceDate),
    });
  }

  @Get('pnl')
  async pnl(
    @CurrentUser() user: JwtUser,
    @Query('asOf') asOf?: string,
    @Query('sinceDate') sinceDate?: string,
  ) {
    this.assertRead(user);
    return this.svc.profitAndLoss({
      asOf: parseDate(asOf),
      sinceDate: parseDate(sinceDate),
    });
  }

  @Get('receivables')
  async receivables(
    @CurrentUser() user: JwtUser,
    @Query('asOf') asOf?: string,
    @Query('sinceDate') sinceDate?: string,
  ) {
    this.assertRead(user);
    return this.svc.receivablesAndCash({
      asOf: parseDate(asOf),
      sinceDate: parseDate(sinceDate),
    });
  }

  @Get('reconciliation')
  async reconciliation(
    @CurrentUser() user: JwtUser,
    @Query('sinceDate') sinceDate?: string,
  ) {
    this.assertRead(user);
    return this.svc.crossBranchReconciliation({
      sinceDate: parseDate(sinceDate),
    });
  }

  private assertRead(user: JwtUser) {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!READ_ROLES.has(role)) {
      throw new ForbiddenException('Branch accounting restricted');
    }
  }
}
