import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type JwtUser,
} from '../../auth/decorators/current-user.decorator';
import { FinancialPeriodsService } from './financial-periods.service';

const CLOSE_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.ACCOUNTANT,
]);

const READ_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
]);

@Controller('api/finance/periods')
@UseGuards(JwtAuthGuard)
export class FinancialPeriodsController {
  constructor(private readonly svc: FinancialPeriodsService) {}

  @Get()
  async list(@CurrentUser() user: JwtUser) {
    this.assertRead(user);
    return this.svc.list();
  }

  @Get('status')
  async status(
    @CurrentUser() user: JwtUser,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    this.assertRead(user);
    return this.svc.getStatus(Number(year), Number(month));
  }

  @Get('violations')
  async violations(
    @CurrentUser() user: JwtUser,
    @Query('periodId') periodId?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertRead(user);
    return this.svc.listViolations({
      periodId: periodId?.trim() || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('close')
  async close(
    @CurrentUser() user: JwtUser,
    @Body()
    body: { year: number; month: number; notes?: string | null; confirmation: string },
  ) {
    this.assertClose(user);
    if (!body) throw new BadRequestException('body is required');
    return this.svc.closePeriod({
      year: Number(body.year),
      month: Number(body.month),
      actorId: user.userId,
      notes: body.notes ?? null,
      confirmation: body.confirmation,
    });
  }

  @Post('reopen')
  async reopen(
    @CurrentUser() user: JwtUser,
    @Body()
    body: { year: number; month: number; reason: string; confirmation: string },
  ) {
    this.assertClose(user);
    if (!body) throw new BadRequestException('body is required');
    return this.svc.reopenPeriod({
      year: Number(body.year),
      month: Number(body.month),
      actorId: user.userId,
      reason: body.reason,
      confirmation: body.confirmation,
    });
  }

  private assertClose(user: JwtUser) {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!CLOSE_ROLES.has(role)) {
      throw new ForbiddenException(
        'Only Owner / Accountant can close or reopen financial periods',
      );
    }
  }

  private assertRead(user: JwtUser) {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!READ_ROLES.has(role)) {
      throw new ForbiddenException('Period status restricted');
    }
  }
}
