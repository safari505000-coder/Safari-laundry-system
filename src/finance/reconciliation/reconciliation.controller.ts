import {
  Controller,
  ForbiddenException,
  Get,
  UseGuards,
} from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtUser } from '../../auth/decorators/current-user.decorator';
import {
  ReconciliationService,
  type ReconciliationReport,
} from './reconciliation.service';

/**
 * V20.4 — Phase 6 reconciliation HTTP endpoint.
 *
 * GET /api/finance/reconciliation/run
 *   Authenticated. Restricted to OWNER, ACCOUNTANT, and the
 *   call-center supervisor roles (the operators who can act on
 *   a drift event). Runs the four invariants synchronously and
 *   returns the full report.
 *
 * Intentionally not paginated — the reconciliation produces ≤4
 * rows, so the response fits comfortably in a single payload.
 */
const ALLOWED_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.ACCOUNTANT,
  SafariRole.GENERAL_MANAGER,
  SafariRole.CALL_CENTER_SUPERVISOR,
]);

@Controller('finance/reconciliation')
@UseGuards(JwtAuthGuard)
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get('run')
  async runOnce(@CurrentUser() user: JwtUser): Promise<ReconciliationReport> {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!ALLOWED_ROLES.has(role)) {
      throw new ForbiddenException(
        'Only Owner / Accountant / GM / CC Supervisor may run reconciliation',
      );
    }
    return this.reconciliation.runOnce();
  }
}
