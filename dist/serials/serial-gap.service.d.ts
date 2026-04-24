import { PrismaService } from '../prisma/prisma.service';
export interface GapReport {
    scannedAtIso: string;
    currentCounter: number;
    presentCount: number;
    gapCount: number;
    firstGaps: string[];
    allGapsTruncated: boolean;
}
export declare class SerialGapService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    handleCron(): Promise<void>;
    runDailyCheck(): Promise<GapReport>;
    scanNow(): Promise<GapReport>;
    scanGaps(): Promise<GapReport>;
    latestReport(): Promise<{
        report: GapReport;
        hadGaps: boolean;
        recordedAtIso: string;
    } | null>;
    private recordScanAudit;
}
