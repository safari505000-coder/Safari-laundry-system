import { CashMonitorService } from './cash-monitor.service';
import { CashRiskService } from './cash-risk.service';
import { CashExecutiveService } from './cash-executive.service';
import { DriverAmountAuditResponseDto } from './dto/driver-amount-audit.dto';
export declare class DriverAmountAuditService {
    private readonly monitor;
    private readonly risk;
    private readonly executive;
    constructor(monitor: CashMonitorService, risk: CashRiskService, executive: CashExecutiveService);
    run(): Promise<DriverAmountAuditResponseDto>;
    private buildBuckets;
    private buildRow;
    private classify;
}
