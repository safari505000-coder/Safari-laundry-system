/**
 * SystemGuardianController — read-only Guardian surface.
 *
 * - `GET /api/system-guardian/status`      — last sweep + last 20 sweep
 *   summaries. Cheap; safe to poll from the executive dashboard.
 * - `POST /api/system-guardian/run`        — trigger a sweep on demand.
 *   Returns the same payload as `status`.
 * - `GET /api/system-guardian/diagnostics` — fan out across Guardian +
 *   IntegrityAudit + DriverAmountAudit, then run each detected issue
 *   through `DiagnosticsEngineService` to produce per-issue Arabic
 *   explanations + recommended actions. Read-only, deterministic.
 *
 * RBAC: OWNER + GENERAL_MANAGER only — same audience as the safety
 * surfaces (`/verify`, `/integrity-audit`). The role is enforced at
 * the decorator AND re-asserted in the handler as defence in depth.
 */
import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SystemGuardianService } from './system-guardian.service';
import { IntegrityAuditService } from '../cash-monitor/integrity-audit.service';
import { DriverAmountAuditService } from '../cash-monitor/driver-amount-audit.service';
import { DiagnosticsEngineService } from '../cash-monitor/diagnostics-engine.service';
import {
  GuardianResponseDto,
  GuardianStatusResponseDto,
} from './dto/system-guardian.dto';
import { DiagnosticsResponseDto } from '../cash-monitor/dto/diagnostics.dto';

@ApiTags('system-guardian')
@ApiBearerAuth()
@Controller('system-guardian')
@Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
export class SystemGuardianController {
  constructor(
    private readonly guardian: SystemGuardianService,
    private readonly integrity: IntegrityAuditService,
    private readonly driverAmount: DriverAmountAuditService,
    private readonly diagnostics: DiagnosticsEngineService,
  ) {}

  @Get('status')
  @ApiOkResponse({ type: GuardianStatusResponseDto })
  async status(
    @CurrentUser() user: JwtUser,
  ): Promise<GuardianStatusResponseDto> {
    this.assertOwnerTier(user);
    return this.guardian.status();
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GuardianResponseDto })
  async run(@CurrentUser() user: JwtUser): Promise<GuardianResponseDto> {
    this.assertOwnerTier(user);
    return this.guardian.runOnce();
  }

  /**
   * Diagnostics fan-out. Pulls the latest detected issues from all
   * three auditors and routes each one through `DiagnosticsEngineService`
   * to produce an Arabic explanation + recommended action. The
   * Guardian read uses the cached last-sweep payload — we do NOT
   * trigger a fresh sweep here (call `POST /run` first if you want a
   * fresh snapshot).
   */
  @Get('diagnostics')
  @ApiOkResponse({ type: DiagnosticsResponseDto })
  async runDiagnostics(
    @CurrentUser() user: JwtUser,
  ): Promise<DiagnosticsResponseDto> {
    this.assertOwnerTier(user);
    const [integrity, drivers, guardian] = await Promise.all([
      this.integrity.run(),
      this.driverAmount.run(),
      this.guardian.status(),
    ]);
    return this.diagnostics.compose({ guardian, integrity, drivers });
  }

  private assertOwnerTier(user: JwtUser): void {
    if (
      user.role !== SafariRole.OWNER &&
      user.role !== SafariRole.GENERAL_MANAGER
    ) {
      throw new ForbiddenException(
        'System Guardian is restricted to OWNER and GENERAL_MANAGER.',
      );
    }
  }
}
