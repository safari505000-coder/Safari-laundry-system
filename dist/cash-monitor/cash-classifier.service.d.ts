import { CashIntelligenceV2Service } from '../cash-intelligence/cash-intelligence-v2.service';
import { CashIntelligenceAnalysisDto } from '../cash-intelligence/dto/cash-intelligence-analysis.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CashClassifiedResponseDto } from './dto/cash-classified.dto';
export declare class CashClassifierService {
    private readonly v2;
    private readonly prisma;
    constructor(v2: CashIntelligenceV2Service, prisma: PrismaService);
    classify(): Promise<CashClassifiedResponseDto>;
    composeFromAnalysis(analysis: CashIntelligenceAnalysisDto): CashClassifiedResponseDto;
}
