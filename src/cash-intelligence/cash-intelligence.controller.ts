/**
 * Cash Intelligence Controller — STRICTLY READ-ONLY (v2 only).
 *
 * Legacy `/today` and `/report` endpoints (v1) have been retired as
 * part of the Cash Intelligence stabilisation plan. They ran a parallel
 * pipeline without the 24h grace gate, the 5 KD floor, and were not
 * aligned with the classifier (single source of truth). Any caller that
 * wants the strict-mode analysis must now use `/analysis` directly, or
 * read the SSoT-aligned dashboard payload via `/classified`.
 *
 * Authorisation:
 *   OWNER, GENERAL_MANAGER, ACCOUNTANT — full visibility
 *   MANAGER                            — clamped to their JWT branchId
 */
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/permissions/permissions.decorator';
import { AppPermission } from '../auth/permissions/permissions.enum';
import { CashIntelligenceV2Service } from './cash-intelligence-v2.service';
import { CashIntelligenceQueryDto } from './dto/cash-intelligence-query.dto';
import { CashIntelligenceAnalysisDto } from './dto/cash-intelligence-analysis.dto';

@ApiTags('cash-intelligence')
@ApiBearerAuth()
@Controller('cash-intelligence')
@Roles(
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.MANAGER,
)
@Permissions(AppPermission.VIEW_CASH)
export class CashIntelligenceController {
  constructor(private readonly v2Service: CashIntelligenceV2Service) {}

  /**
   * Strict-mode v2 analysis with self-explanation, SHIFT_OVERDUE
   * override, amount-aware severity, tolerance band, and decision
   * lock. This is the only raw-analysis surface; everything else
   * (`/live`, `/operational`, `/classified`, `/risk`, `/executive`,
   * `/exposure`) is composed on top of this snapshot.
   */
  @Get('analysis')
  @ApiOkResponse({ type: CashIntelligenceAnalysisDto })
  async getAnalysis(
    @Query() query: CashIntelligenceQueryDto,
    @CurrentUser() user: JwtUser,
  ): Promise<CashIntelligenceAnalysisDto> {
    const branchId = this.clampBranchScope(user, query.branchId);
    return this.v2Service.runAnalysis({ date: query.date, branchId });
  }

  // ─── Branch clamp ─────────────────────────────────────────────
  // V19.33 — A Branch Manager may NEVER read another branch's data.
  // We force `branchId` to their own JWT branch and reject mismatched
  // hand-crafted queries with a 400.
  private clampBranchScope(user: JwtUser, requested?: string): string | undefined {
    if (user.role !== SafariRole.MANAGER) return requested;
    if (!user.branchId) {
      throw new ForbiddenException(
        'Manager has no branchId on JWT — cannot scope cash intelligence view.',
      );
    }
    if (requested && requested !== user.branchId) {
      throw new BadRequestException(
        'branchId does not match your assigned branch.',
      );
    }
    return user.branchId;
  }
}
