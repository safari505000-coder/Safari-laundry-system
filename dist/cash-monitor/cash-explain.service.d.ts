import { CashMonitorService } from './cash-monitor.service';
import { CashClassifierService } from './cash-classifier.service';
import { CashIntelligenceAnalysisDto } from '../cash-intelligence/dto/cash-intelligence-analysis.dto';
import { CashExplainResponseDto } from './dto/cash-explain.dto';
export declare class CashExplainService {
    private readonly monitor;
    private readonly classifier;
    private readonly logger;
    constructor(monitor: CashMonitorService, classifier: CashClassifierService);
    getExplain(): Promise<CashExplainResponseDto>;
    composeFromAnalysis(snapshot: CashIntelligenceAnalysisDto | null): CashExplainResponseDto;
    private assertBucketReconciliation;
}
