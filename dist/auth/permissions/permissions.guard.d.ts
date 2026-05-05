import { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
export declare class PermissionsGuard implements CanActivate {
    private readonly reflector;
    private readonly auditLogs;
    constructor(reflector: Reflector, auditLogs: AuditLogsService);
    canActivate(context: ExecutionContext): boolean;
    private auditFinancialAccess;
}
