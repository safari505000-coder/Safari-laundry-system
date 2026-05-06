import { DispatchService } from './dispatch.service';
export declare class DispatchEscalationJob {
    private readonly dispatch;
    private readonly logger;
    private isRunning;
    constructor(dispatch: DispatchService);
    tick(): Promise<void>;
    runOnce(): Promise<{
        inspected: number;
        firstAlerts: number;
        escalations: number;
        breaches: number;
    }>;
}
