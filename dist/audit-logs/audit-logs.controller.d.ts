import { AuditLogsService } from './audit-logs.service';
import { AuditLogsQueryDto } from './dto/audit-logs-query.dto';
import { AuditLogTimelineResponseDto } from './dto/audit-logs-timeline.dto';
export declare class AuditLogsController {
    private readonly auditLogs;
    constructor(auditLogs: AuditLogsService);
    listLogs(query: AuditLogsQueryDto): Promise<AuditLogTimelineResponseDto>;
}
