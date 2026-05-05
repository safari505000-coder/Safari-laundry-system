import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { CashIntelligenceV2Service } from './cash-intelligence-v2.service';
import { CashIntelligenceQueryDto } from './dto/cash-intelligence-query.dto';
import { CashIntelligenceAnalysisDto } from './dto/cash-intelligence-analysis.dto';
export declare class CashIntelligenceController {
    private readonly v2Service;
    constructor(v2Service: CashIntelligenceV2Service);
    getAnalysis(query: CashIntelligenceQueryDto, user: JwtUser): Promise<CashIntelligenceAnalysisDto>;
    private clampBranchScope;
}
