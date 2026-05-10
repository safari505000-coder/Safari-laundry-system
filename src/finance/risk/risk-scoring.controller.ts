import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type JwtUser,
} from '../../auth/decorators/current-user.decorator';
import { RiskScoringService } from './risk-scoring.service';

const READ_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.CALL_CENTER_SUPERVISOR,
]);

@Controller('finance/risk')
@UseGuards(JwtAuthGuard)
export class RiskScoringController {
  constructor(private readonly svc: RiskScoringService) {}

  @Get('customers/:id')
  async getOne(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    this.assertRead(user);
    return this.svc.getScore(id);
  }

  @Get('at-risk')
  async listAtRisk(
    @CurrentUser() user: JwtUser,
    @Query('limit') limit?: string,
  ) {
    this.assertRead(user);
    return this.svc.listAtRiskCustomers({
      limit: limit ? Number(limit) : undefined,
    });
  }

  private assertRead(user: JwtUser) {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!READ_ROLES.has(role)) {
      throw new ForbiddenException('Risk scoring restricted');
    }
  }
}
