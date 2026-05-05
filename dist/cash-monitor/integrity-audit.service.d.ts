import { CashMonitorService } from './cash-monitor.service';
import { CashDecisionService } from './cash-decision.service';
import { CashExecutiveService } from './cash-executive.service';
import { CashRiskService } from './cash-risk.service';
import { IntegrityAuditResponseDto } from './dto/integrity-audit.dto';
export declare class IntegrityAuditService {
    private readonly monitor;
    private readonly decisions;
    private readonly executive;
    private readonly risk;
    constructor(monitor: CashMonitorService, decisions: CashDecisionService, executive: CashExecutiveService, risk: CashRiskService);
    run(): Promise<IntegrityAuditResponseDto>;
}
