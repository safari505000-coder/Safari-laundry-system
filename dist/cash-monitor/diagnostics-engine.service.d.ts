import { GuardianResponseDto, GuardianStatusResponseDto } from '../system-guardian/dto/system-guardian.dto';
import { IntegrityAuditResponseDto } from './dto/integrity-audit.dto';
import { DriverAmountAuditResponseDto } from './dto/driver-amount-audit.dto';
import { DiagnosticsResponseDto } from './dto/diagnostics.dto';
export declare class DiagnosticsEngineService {
    compose(input: {
        guardian: GuardianStatusResponseDto | GuardianResponseDto | null;
        integrity: IntegrityAuditResponseDto | null;
        drivers: DriverAmountAuditResponseDto | null;
    }): DiagnosticsResponseDto;
    private fromGuardianIssue;
    private fromIntegrityIssue;
    private fromDriverAmount;
    private guardianRootCause;
    private integrityRootCause;
    private driverAmountRootCause;
    private severityFor;
    private explanationFor;
    private actionFor;
}
