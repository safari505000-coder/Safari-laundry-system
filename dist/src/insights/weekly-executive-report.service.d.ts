import { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';
import { InsightsService } from './insights.service';
export declare class WeeklyExecutiveReportService {
    private readonly prisma;
    private readonly insights;
    private readonly logger;
    private readonly archiveDir;
    constructor(prisma: PrismaService, insights: InsightsService);
    runWeekly(): Promise<void>;
    generateLatest(): Promise<{
        key: string;
        filename: string;
        sizeBytes: number;
        generatedAt: string;
        periodFrom: string;
        periodTo: string;
    }>;
    listArchive(): Promise<{
        key: string;
        filename: string;
        sizeBytes: number;
        generatedAt: string;
    }[]>;
    openReport(key: string): Promise<{
        stream: Readable;
        filename: string;
    }>;
    private collectPayload;
    private writePdf;
}
