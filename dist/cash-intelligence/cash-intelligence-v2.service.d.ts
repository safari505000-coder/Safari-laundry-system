import { PrismaService } from '../prisma/prisma.service';
import { CashIntelligenceAnalysisDto } from './dto/cash-intelligence-analysis.dto';
export interface CashV2Query {
    date?: string;
    branchId?: string;
}
export declare class CashIntelligenceV2Service {
    private readonly prisma;
    constructor(prisma: PrismaService);
    runAnalysis(query?: CashV2Query): Promise<CashIntelligenceAnalysisDto>;
}
