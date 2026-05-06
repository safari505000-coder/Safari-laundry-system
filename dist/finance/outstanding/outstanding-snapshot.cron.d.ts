import { OutstandingService } from './outstanding.service';
export type OutstandingSnapshotResult = {
    ranAtIso: string;
    fromIso: string;
    toIso: string;
    totalCustomers: number;
    totalInvoices: number;
    totalDueKd: string;
    blockedCount: number;
    lateCount: number;
    riskCount: number;
    error?: string;
};
export declare class OutstandingSnapshotCron {
    private readonly outstanding;
    private readonly logger;
    private isRunning;
    private lastResult;
    constructor(outstanding: OutstandingService);
    tick(): Promise<void>;
    runOnce(): Promise<OutstandingSnapshotResult>;
    getLastResult(): OutstandingSnapshotResult | null;
}
