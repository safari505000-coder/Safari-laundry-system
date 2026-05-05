import { DispatchService } from './dispatch.service';
export declare class DispatchReconciliationJob {
    private readonly dispatch;
    private readonly logger;
    private isRunning;
    constructor(dispatch: DispatchService);
    tick(): Promise<void>;
    runOnce(): Promise<{
        inspected: number;
        closed: number;
    }>;
}
