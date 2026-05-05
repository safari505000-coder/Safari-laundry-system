import { CashIntelligenceV2Service } from '../cash-intelligence/cash-intelligence-v2.service';
import { CashIntelligenceAnalysisDto } from '../cash-intelligence/dto/cash-intelligence-analysis.dto';
import { CashExposureResponseDto } from './dto/cash-exposure.dto';
import { CashClassifierService } from './cash-classifier.service';
export declare class CashExposureService {
    private readonly v2;
    private readonly classifier;
    constructor(v2: CashIntelligenceV2Service, classifier: CashClassifierService);
    computeExposure(): Promise<CashExposureResponseDto>;
    composeFromAnalysis(analysis: CashIntelligenceAnalysisDto): CashExposureResponseDto;
}
