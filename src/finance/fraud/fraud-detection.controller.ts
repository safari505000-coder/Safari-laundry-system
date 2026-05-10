import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FraudAlertSeverity, FraudAlertStatus, SafariRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type JwtUser,
} from '../../auth/decorators/current-user.decorator';
import { FraudDetectionService } from './fraud-detection.service';

const READ_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
]);

const RESOLVE_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.ACCOUNTANT,
]);

@Controller('finance/fraud-alerts')
@UseGuards(JwtAuthGuard)
export class FraudDetectionController {
  constructor(private readonly svc: FraudDetectionService) {}

  @Get()
  async list(
    @CurrentUser() user: JwtUser,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('customerId') customerId?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertRead(user);
    return this.svc.list({
      status: this.parseStatus(status),
      severity: this.parseSeverity(severity),
      customerId: customerId?.trim() || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('run')
  async run(@CurrentUser() user: JwtUser) {
    this.assertResolve(user);
    return this.svc.runAll();
  }

  @Post(':id/resolve')
  async resolve(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { status: string; notes?: string | null },
  ) {
    this.assertResolve(user);
    return this.svc.resolve({
      alertId: id,
      actorId: user.userId,
      status: this.parseStatus(body?.status) ?? FraudAlertStatus.RESOLVED_CONFIRMED,
      notes: body?.notes ?? null,
    });
  }

  private parseStatus(raw?: string): FraudAlertStatus | undefined {
    if (!raw) return undefined;
    const upper = raw.trim().toUpperCase();
    const allowed = [
      FraudAlertStatus.OPEN,
      FraudAlertStatus.INVESTIGATING,
      FraudAlertStatus.RESOLVED_CONFIRMED,
      FraudAlertStatus.RESOLVED_FALSE_POSITIVE,
    ];
    if (!allowed.includes(upper as FraudAlertStatus)) {
      throw new BadRequestException(`Unknown status: ${raw}`);
    }
    return upper as FraudAlertStatus;
  }

  private parseSeverity(raw?: string): FraudAlertSeverity | undefined {
    if (!raw) return undefined;
    const upper = raw.trim().toUpperCase();
    if (
      upper === FraudAlertSeverity.LOW ||
      upper === FraudAlertSeverity.MEDIUM ||
      upper === FraudAlertSeverity.HIGH ||
      upper === FraudAlertSeverity.CRITICAL
    ) {
      return upper as FraudAlertSeverity;
    }
    throw new BadRequestException(`Unknown severity: ${raw}`);
  }

  private assertRead(user: JwtUser) {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!READ_ROLES.has(role)) {
      throw new ForbiddenException('Fraud alerts restricted');
    }
  }

  private assertResolve(user: JwtUser) {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!RESOLVE_ROLES.has(role)) {
      throw new ForbiddenException('Only Owner / Accountant can run / resolve alerts');
    }
  }
}
