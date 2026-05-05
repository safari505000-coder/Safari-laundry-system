import { DispatchService } from './dispatch.service';
export declare class DispatchEscalationJob {
    private readonly dispatch;
    private readonly logger;
    readonly escalateAfterMinutes: number;
    private isRunning;
    constructor(dispatch: DispatchService);
    tick(): Promise<void>;
    runOnce(): Promise<{
        inspected: number;
        escalated: number;
        skipped: number;
    }>;
}
