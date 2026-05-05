import { ReplayQueueDto } from './dto/replay-queue.dto';
import { QueueAdminService } from './queue-admin.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
export declare class QueueAdminController {
    private readonly queues;
    private readonly auditLogs;
    constructor(queues: QueueAdminService, auditLogs: AuditLogsService);
    replay(dto: ReplayQueueDto): Promise<{
        queue: "alerts" | "whatsapp";
        replayed: number;
        skipped: number;
    }>;
    metrics(): Promise<Record<string, unknown>>;
    dlq(queue?: 'alerts' | 'whatsapp', limit?: string): Promise<Record<string, unknown[]>>;
    replayOne(jobId: string, dto: ReplayQueueDto): Promise<{
        queue: "alerts" | "whatsapp";
        replayed: number;
        skipped: number;
    }>;
    replayAll(dto: ReplayQueueDto): Promise<{
        queue: "alerts" | "whatsapp";
        replayed: number;
        skipped: number;
    }>;
    verifyAudit(): Promise<{
        valid: boolean;
        checked: number;
        brokenAt?: string;
    }>;
}
