import { PrismaService } from '../prisma/prisma.service';
import { SerialCounterService } from './serial-counter.service';
export interface GapReport {
    scannedAtIso: string;
    currentCounter: number;
    presentCount: number;
    gapCount: number;
    firstGaps: number[];
    allGapsTruncated: boolean;
}
export declare class SerialGapService {
    private readonly prisma;
    private readonly counter;
    private readonly logger;
    constructor(prisma: PrismaService, counter: SerialCounterService);
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
