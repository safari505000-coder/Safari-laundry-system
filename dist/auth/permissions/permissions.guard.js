"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionsGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const client_1 = require("@prisma/client");
const audit_logs_service_1 = require("../../audit-logs/audit-logs.service");
const roles_decorator_1 = require("../decorators/roles.decorator");
const permissions_decorator_1 = require("./permissions.decorator");
const permissions_enum_1 = require("./permissions.enum");
const roles_permissions_map_1 = require("./roles-permissions.map");
let PermissionsGuard = class PermissionsGuard {
    reflector;
    auditLogs;
    constructor(reflector, auditLogs) {
        this.reflector = reflector;
        this.auditLogs = auditLogs;
    }
    canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(roles_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }
        const required = this.reflector.getAllAndOverride(permissions_decorator_1.PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
        if (!required?.length) {
            return true;
        }
        const req = context.switchToHttp().getRequest();
        const role = req.user?.role;
        const granted = new Set((0, roles_permissions_map_1.permissionsForRole)(role));
        const ok = required.every((permission) => granted.has(permission));
        if (!ok) {
            this.auditLogs.auditDenied(req, 'PERMISSION_DENIED', `missing_permissions:${required.join(',')}`);
            throw new common_1.ForbiddenException('Missing required permission.');
        }
        this.auditFinancialAccess(req, required);
        return true;
    }
    auditFinancialAccess(req, permissions) {
        const shouldAudit = permissions.some((permission) => [
            permissions_enum_1.AppPermission.VIEW_INVOICES,
            permissions_enum_1.AppPermission.AUDIT_INVOICE,
            permissions_enum_1.AppPermission.VIEW_REPORTS,
            permissions_enum_1.AppPermission.VIEW_FINANCIAL_REPORTS,
            permissions_enum_1.AppPermission.VIEW_CASH,
            permissions_enum_1.AppPermission.VIEW_DEBTS,
            permissions_enum_1.AppPermission.VIEW_PAYROLL,
            permissions_enum_1.AppPermission.APPROVE_EXPENSES,
        ].includes(permission));
        if (!shouldAudit) {
            return;
        }
        this.auditLogs.log({
            userId: req.user?.userId ?? req.user?.sub ?? null,
            role: req.user?.role ?? null,
            action: 'PERMISSION_ACCESS',
            resource: 'financial_oversight',
            endpoint: req.originalUrl ?? req.url,
            method: req.method,
            status: client_1.AuditStatus.SUCCESS,
            ip: req.ip ?? null,
            userAgent: typeof req.headers['user-agent'] === 'string' ?
                req.headers['user-agent']
                : null,
            requestId: req.requestId ?? null,
            changes: { permissions },
        });
    }
};
exports.PermissionsGuard = PermissionsGuard;
exports.PermissionsGuard = PermissionsGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        audit_logs_service_1.AuditLogsService])
], PermissionsGuard);
//# sourceMappingURL=permissions.guard.js.map