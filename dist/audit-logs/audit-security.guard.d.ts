import { CanActivate, ExecutionContext } from "@nestjs/common";
import { AuditLogsService } from './audit-logs.service';
export declare class AuditSecurityGuard implements CanActivate {
    private readonly auditLogs;
    constructor(auditLogs: AuditLogsService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
