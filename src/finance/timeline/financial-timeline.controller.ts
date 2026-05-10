import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { FinancialTimelineService } from './financial-timeline.service';

const TIMELINE_READ_ROLES = [
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
  SafariRole.MANAGER,
] as const;

@ApiTags('finance.timeline')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinancialTimelineController {
  constructor(private readonly timeline: FinancialTimelineService) {}

  /**
   * V20.4 endpoint — kept for back-compat with existing UI calls.
   */
  @Get('finance/timeline/:customerId')
  @Roles(...TIMELINE_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.4 — Phase 8 unified financial timeline for a customer (invoice, payment, partial, wallet, debt, subscription, reversals)',
  })
  async getTimelineLegacy(
    @Param('customerId') customerId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.serve(customerId, limit, before);
  }

  /**
   * V20.5 — Phase 4 canonical endpoint.
   *   GET /api/customers/:id/financial-timeline
   *
   * Adds Promise events, Collections stage transitions, and raw
   * journal entries on top of the V20.4 sources. Same response
   * shape as the legacy endpoint so UIs can swap routes
   * incrementally without changing rendering code.
   */
  @Get('api/customers/:id/financial-timeline')
  @Roles(...TIMELINE_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.5 — Phase 4 unified financial timeline (orders, ledger, subs, GL, journal, promises, collections stages)',
  })
  async getTimelineV5(
    @Param('id') customerId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.serve(customerId, limit, before);
  }

  private serve(customerId: string, limit?: string, before?: string) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    if (parsedLimit !== undefined && !Number.isFinite(parsedLimit)) {
      throw new BadRequestException('limit must be a number');
    }
    let parsedBefore: Date | null = null;
    if (before) {
      const t = new Date(before);
      if (Number.isNaN(t.getTime())) {
        throw new BadRequestException('before must be an ISO-8601 timestamp');
      }
      parsedBefore = t;
    }
    return this.timeline.getTimeline(customerId, {
      limit: parsedLimit,
      before: parsedBefore,
    });
  }
}
