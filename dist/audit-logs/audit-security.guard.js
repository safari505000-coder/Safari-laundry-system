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
exports.AuditSecurityGuard = void 0;
const common_1 = require("@nestjs/common");
const audit_logs_service_1 = require("./audit-logs.service");
let AuditSecurityGuard = class AuditSecurityGuard {
    auditLogs;
    constructor(auditLogs) {
        this.auditLogs = auditLogs;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        if (await this.auditLogs.checkBlocked(req)) {
            this.auditLogs.auditDenied(req, 'TEMPORARILY_BLOCKED', 'blocked_until_active');
            throw new common_1.ForbiddenException('temporarily blocked');
        }
        if (!(await this.auditLogs.checkSensitiveRateLimit(req))) {
            this.auditLogs.auditDenied(req, 'RATE_LIMIT_EXCEEDED', 'ip_rate_limit');
            throw new common_1.HttpException('Too many requests', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        if (!(await this.auditLogs.checkFailedAttemptBudget(req))) {
            this.auditLogs.auditDenied(req, 'RATE_LIMIT_EXCEEDED', 'failed_attempt_budget');
            throw new common_1.HttpException('Too many failed attempts', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        return true;
    }
};
exports.AuditSecurityGuard = AuditSecurityGuard;
exports.AuditSecurityGuard = AuditSecurityGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [audit_logs_service_1.AuditLogsService])
], AuditSecurityGuard);
//# sourceMappingURL=audit-security.guard.js.map