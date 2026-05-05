import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { SystemGuardianService } from './system-guardian.service';
import { IntegrityAuditService } from '../cash-monitor/integrity-audit.service';
import { DriverAmountAuditService } from '../cash-monitor/driver-amount-audit.service';
import { DiagnosticsEngineService } from '../cash-monitor/diagnostics-engine.service';
import { GuardianResponseDto, GuardianStatusResponseDto } from './dto/system-guardian.dto';
import { DiagnosticsResponseDto } from '../cash-monitor/dto/diagnostics.dto';
export declare class SystemGuardianController {
    private readonly guardian;
    private readonly integrity;
    private readonly driverAmount;
    private readonly diagnostics;
    constructor(guardian: SystemGuardianService, integrity: IntegrityAuditService, driverAmount: DriverAmountAuditService, diagnostics: DiagnosticsEngineService);
    status(user: JwtUser): Promise<GuardianStatusResponseDto>;
    run(user: JwtUser): Promise<GuardianResponseDto>;
    runDiagnostics(user: JwtUser): Promise<DiagnosticsResponseDto>;
    private assertOwnerTier;
}
