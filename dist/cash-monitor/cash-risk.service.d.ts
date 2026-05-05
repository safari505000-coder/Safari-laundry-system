import { CashIntelligenceV2Service } from '../cash-intelligence/cash-intelligence-v2.service';
import { CashIntelligenceAnalysisDto } from '../cash-intelligence/dto/cash-intelligence-analysis.dto';
import { CashExecutionTrackerService } from './cash-execution-tracker.service';
import { CashClassifierService } from './cash-classifier.service';
import { CashClassifiedResponseDto } from './dto/cash-classified.dto';
import { CashRiskResponseDto } from './dto/cash-risk.dto';
export declare class CashRiskService {
    private readonly v2;
    private readonly tracker;
    private readonly classifier;
    constructor(v2: CashIntelligenceV2Service, tracker: CashExecutionTrackerService, classifier: CashClassifierService);
    computeRisk(): Promise<CashRiskResponseDto>;
    composeFromAnalysis(analysis: CashIntelligenceAnalysisDto, classified: CashClassifiedResponseDto, lateCounts: ReadonlyMap<string, number>): CashRiskResponseDto;
}
