import { CashMonitorService } from './cash-monitor.service';
import { CashDecisionService } from './cash-decision.service';
import { CashExecutionTrackerService } from './cash-execution-tracker.service';
import { CashDecisionsResponseDto } from './dto/cash-decision.dto';
import { OperationalLiveDto } from './dto/cash-monitor-operational.dto';
import { CashMonitorLiveDto } from './dto/cash-monitor.dto';
import { CashExecutiveResponseDto } from './dto/cash-executive.dto';
import { CashClassifiedResponseDto } from './dto/cash-classified.dto';
import { CashExposureService } from './cash-exposure.service';
import { ExposureSilentAlertDto } from './dto/cash-exposure.dto';
export declare class CashExecutiveService {
    private readonly monitor;
    private readonly decisions;
    private readonly tracker;
    private readonly exposure;
    private readonly logger;
    constructor(monitor: CashMonitorService, decisions: CashDecisionService, tracker: CashExecutionTrackerService, exposure: CashExposureService);
    getExecutiveView(): Promise<CashExecutiveResponseDto>;
    compose(live: CashMonitorLiveDto, operational: OperationalLiveDto, decisions: CashDecisionsResponseDto, classified: CashClassifiedResponseDto, silentAlerts: ExposureSilentAlertDto[] | null): Promise<CashExecutiveResponseDto>;
}
