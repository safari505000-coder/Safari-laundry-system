import { CashMonitorService } from './cash-monitor.service';
import { CashDecisionsResponseDto } from './dto/cash-decision.dto';
export declare class CashDecisionService {
    private readonly monitor;
    constructor(monitor: CashMonitorService);
    getDecisions(): Promise<CashDecisionsResponseDto>;
    private compose;
}
