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
var AuditLogsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogsService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const discord_alert_service_1 = require("../common/services/discord-alert.service");
const prisma_service_1 = require("../prisma/prisma.service");
const security_state_service_1 = require("./security-state.service");
const ONE_MINUTE_MS = 60_000;
const FORBIDDEN_THRESHOLD = 5;
const BLOCK_THRESHOLD = 8;
const TEMP_BLOCK_MS = 10 * 60_000;
const ALERT_COOLDOWN_MS = 60_000;
const SENSITIVE_IP_LIMIT = 10;
let AuditLogsService = AuditLogsService_1 = class AuditLogsService {
    prisma;
    discordAlerts;
    securityState;
    logger = new common_1.Logger(AuditLogsService_1.name);
    constructor(prisma, discordAlerts, securityState) {
        this.prisma = prisma;
        this.discordAlerts = discordAlerts;
        this.securityState = securityState;
    }
    log(input) {
        void this.write(input).catch((error) => {
            this.logger.warn(`audit_log_failed action=${input.action} reason=${error instanceof Error ? error.message : String(error)}`);
        });
    }
    logFinancialEvent(input) {
        this.log({
            userId: input.userId ?? null,
            role: input.role ?? null,
            action: input.action,
            resource: 'financial_event',
            customerId: input.customerId ?? null,
            orderId: input.orderId ?? null,
            amount: input.amount ?? null,
            source: input.source ?? null,
            status: client_1.AuditStatus.SUCCESS,
            changes: {
                customerId: input.customerId ?? null,
                orderId: input.orderId ?? null,
                amount: input.amount ?? null,
                source: input.source ?? null,
                ...(input.changes ?? {}),
            },
        });
    }
    logRequest(req, statusCode) {
        if (!this.shouldAuditRequest(req, statusCode)) {
            return;
        }
        const status = statusCode === 403 || statusCode === 429 ? client_1.AuditStatus.DENIED : client_1.AuditStatus.SUCCESS;
        this.log({
            userId: this.userId(req),
            role: req.user?.role ?? null,
            action: this.actionFor(req),
            resource: this.resourceFor(req),
            endpoint: this.endpoint(req),
            method: req.method,
            status,
            ip: this.ip(req),
            userAgent: this.userAgent(req),
            requestId: req.requestId ?? null,
            changes: { statusCode },
        });
        if (statusCode === 403) {
            void this.recordForbidden(req).catch((error) => this.logger.warn(`audit_forbidden_record_failed reason=${error instanceof Error ? error.message : String(error)}`));
        }
    }
    checkBlocked(req) {
        return this.securityState.isBlocked(this.blockKeys(req));
    }
    async checkSensitiveRateLimit(req) {
        if (!this.isSensitiveEndpoint(this.endpoint(req))) {
            return true;
        }
        const key = this.ip(req) ?? 'unknown';
        const hits = await this.securityState.incrementWindow(`ip:${key}:${this.endpoint(req)}`, 60);
        if (hits > SENSITIVE_IP_LIMIT) {
            this.alert('rate_limit_exceeded', req, {
                attempts: hits,
                endpoint: this.endpoint(req),
            });
            return false;
        }
        return true;
    }
    async checkFailedAttemptBudget(req) {
        const key = this.actorKey(req);
        const attempts = await this.securityState.forbiddenAttempts(key, ONE_MINUTE_MS);
        if (attempts.length < FORBIDDEN_THRESHOLD) {
            return true;
        }
        this.alert('rate_limit_exceeded', req, {
            attempts: attempts.length,
            endpoints: [...new Set(attempts.map((attempt) => attempt.endpoint))],
        });
        return false;
    }
    auditDenied(req, action, reason) {
        this.log({
            userId: this.userId(req),
            role: req.user?.role ?? null,
            action,
            resource: this.resourceFor(req),
            endpoint: this.endpoint(req),
            method: req.method,
            status: client_1.AuditStatus.DENIED,
            ip: this.ip(req),
            userAgent: this.userAgent(req),
            requestId: req.requestId ?? null,
            suspicious: true,
            changes: { reason },
        });
    }
    async write(input) {
        const payload = {
            actorId: input.userId ?? null,
            userId: input.userId ?? null,
            role: input.role ?? null,
            action: input.action,
            resource: input.resource,
            customerId: input.customerId ?? null,
            orderId: input.orderId ?? null,
            amount: input.amount ?? null,
            source: input.source ?? null,
            endpoint: input.endpoint ?? null,
            method: input.method ?? null,
            status: input.status,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            requestId: input.requestId ?? null,
            suspicious: input.suspicious ?? false,
            changes: input.changes ?? {},
            createdAt: new Date().toISOString(),
        };
        const previous = await this.prisma.auditLog.findFirst({
            orderBy: { createdAt: 'desc' },
            select: { hash: true },
        });
        const prevHash = previous?.hash ?? 'GENESIS';
        const hash = this.auditHash(prevHash, payload);
        await this.prisma.auditLog.create({
            data: {
                userId: input.userId ?? undefined,
                actorId: input.userId ?? undefined,
                customerId: input.customerId ?? undefined,
                orderId: input.orderId ?? undefined,
                amount: input.amount != null ? new client_1.Prisma.Decimal(input.amount) : undefined,
                source: input.source ?? undefined,
                role: input.role ?? undefined,
                action: input.action,
                resource: input.resource,
                endpoint: input.endpoint ?? undefined,
                method: input.method ?? undefined,
                status: input.status,
                ip: input.ip ?? undefined,
                userAgent: input.userAgent ?? undefined,
                requestId: input.requestId ?? undefined,
                suspicious: input.suspicious ?? false,
                changes: (input.changes ?? {}),
                payload: payload,
                prevHash,
                hash,
            },
        });
    }
    async verifyAuditIntegrity() {
        const rows = await this.prisma.auditLog.findMany({
            orderBy: { createdAt: 'asc' },
            select: { id: true, payload: true, hash: true, prevHash: true },
        });
        let prevHash = 'GENESIS';
        for (const row of rows) {
            const expected = this.auditHash(prevHash, row.payload ?? {});
            if (row.prevHash !== prevHash || row.hash !== expected) {
                return { valid: false, checked: rows.length, brokenAt: row.id };
            }
            prevHash = row.hash ?? '';
        }
        return { valid: true, checked: rows.length };
    }
    async listTimeline(query) {
        const rows = await this.prisma.auditLog.findMany({
            where: {
                ...(query.customerId ? { customerId: query.customerId } : {}),
                ...(query.orderId ? { orderId: query.orderId } : {}),
            },
            orderBy: { timestamp: 'desc' },
            take: query.driverId ? 500 : 100,
            select: {
                action: true,
                amount: true,
                source: true,
                userId: true,
                timestamp: true,
                payload: true,
                changes: true,
            },
        });
        const filtered = query.driverId ?
            rows.filter((row) => jsonContainsValue(row.payload, query.driverId) ||
                jsonContainsValue(row.changes, query.driverId))
            : rows;
        return {
            rows: filtered.slice(0, 100).map((row) => ({
                action: row.action,
                amount: row.amount?.toFixed(4) ?? null,
                source: row.source ?? null,
                userId: row.userId ?? null,
                timestamp: row.timestamp.toISOString(),
            })),
        };
    }
    auditHash(prevHash, payload) {
        return (0, node_crypto_1.createHash)('sha256')
            .update(prevHash)
            .update(JSON.stringify(payload))
            .digest('hex');
    }
    async recordForbidden(req) {
        const key = this.actorKey(req);
        const endpoint = this.endpoint(req);
        const attempts = await this.securityState.addForbiddenAttempt(key, endpoint, ONE_MINUTE_MS);
        const endpoints = [...new Set(attempts.map((attempt) => attempt.endpoint))];
        if (attempts.length >= FORBIDDEN_THRESHOLD) {
            this.alert('repeated_forbidden_access', req, {
                attempts: attempts.length,
                endpoints,
            });
            this.alert('suspicious_activity_detected', req, {
                attempts: attempts.length,
                endpoints,
            });
        }
        else if (endpoints.length > 1) {
            this.alert('suspicious_activity_detected', req, {
                attempts: attempts.length,
                endpoints,
                reason: 'multiple_restricted_endpoints',
            });
        }
        if (attempts.length >= BLOCK_THRESHOLD) {
            await this.applyTemporaryBlock(req, attempts.length, endpoints);
        }
    }
    async applyTemporaryBlock(req, attempts, endpoints) {
        const until = Date.now() + TEMP_BLOCK_MS;
        await this.securityState.block(this.blockKeys(req), until);
        this.alert('temporary_block_applied', req, {
            attempts,
            endpoints,
            blockedUntil: new Date(until).toISOString(),
        });
        this.auditDenied(req, 'TEMPORARY_BLOCK_APPLIED', 'suspicious_activity');
    }
    alert(event, req, extra) {
        const cooldownKey = `${event}:${this.actorKey(req)}:${this.endpoint(req)}`;
        const now = Date.now();
        void this.securityState
            .acquireCooldown(cooldownKey, ALERT_COOLDOWN_MS)
            .then((allowed) => {
            if (!allowed) {
                return;
            }
            this.discordAlerts.enqueue(event, {
                userId: this.userId(req),
                role: req.user?.role ?? null,
                endpoint: this.endpoint(req),
                ip: this.ip(req),
                requestId: req.requestId,
                timestamp: now,
                ...extra,
            });
        })
            .catch(() => undefined);
    }
    shouldAuditRequest(req, statusCode) {
        return (!!req.user ||
            this.isAuthEndpoint(this.endpoint(req)) ||
            this.isSensitiveEndpoint(this.endpoint(req)) ||
            statusCode === 403 ||
            statusCode === 429);
    }
    actionFor(req) {
        const endpoint = this.endpoint(req);
        if (endpoint.includes('/auth/login'))
            return 'LOGIN';
        if (endpoint.includes('/auth/logout'))
            return 'LOGOUT';
        if (endpoint.includes('/collections'))
            return 'ACCESS_COLLECTIONS';
        if (endpoint.includes('/whatsapp'))
            return 'ACCESS_WHATSAPP';
        if (endpoint.includes('/admin'))
            return 'ACCESS_ADMIN';
        return 'ACCESS_PROTECTED_ENDPOINT';
    }
    resourceFor(req) {
        const endpoint = this.endpoint(req);
        if (endpoint.includes('/collections'))
            return 'collections';
        if (endpoint.includes('/whatsapp'))
            return 'whatsapp_tools';
        if (endpoint.includes('/admin'))
            return 'admin';
        if (endpoint.includes('/auth'))
            return 'auth';
        return 'protected_endpoint';
    }
    isAuthEndpoint(endpoint) {
        return endpoint.includes('/auth/login') || endpoint.includes('/auth/logout');
    }
    isSensitiveEndpoint(endpoint) {
        return (endpoint.includes('/collections') ||
            endpoint.includes('/whatsapp') ||
            endpoint.includes('/admin') ||
            endpoint.includes('/auth/') ||
            endpoint.includes('/payments/callback') ||
            endpoint.includes('/payments/status') ||
            endpoint.includes('/call-center/operations-summary') ||
            endpoint.includes('/call-center/daily-collections') ||
            endpoint.includes('/call-center/orders/'));
    }
    endpoint(req) {
        return req.originalUrl ?? req.url ?? '';
    }
    userId(req) {
        return req.user?.userId ?? req.user?.sub ?? null;
    }
    ip(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded.trim()) {
            return forwarded.split(',')[0]?.trim() ?? null;
        }
        return req.ip ?? req.socket.remoteAddress ?? null;
    }
    userAgent(req) {
        const userAgent = req.headers['user-agent'];
        return typeof userAgent === 'string' ? userAgent : null;
    }
    actorKey(req) {
        return this.userId(req) ? `user:${this.userId(req)}` : `ip:${this.ip(req) ?? 'unknown'}`;
    }
    blockKeys(req) {
        const keys = [`ip:${this.ip(req) ?? 'unknown'}`];
        const userId = this.userId(req);
        if (userId) {
            keys.push(`user:${userId}`);
        }
        return keys;
    }
};
exports.AuditLogsService = AuditLogsService;
exports.AuditLogsService = AuditLogsService = AuditLogsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        discord_alert_service_1.DiscordAlertService,
        security_state_service_1.SecurityStateService])
], AuditLogsService);
function jsonContainsValue(value, expected) {
    if (value === expected)
        return true;
    if (Array.isArray(value)) {
        return value.some((item) => jsonContainsValue(item, expected));
    }
    if (value && typeof value === 'object') {
        return Object.values(value).some((item) => jsonContainsValue(item, expected));
    }
    return false;
}
//# sourceMappingURL=audit-logs.service.js.map