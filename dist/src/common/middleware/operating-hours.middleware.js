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
var OperatingHoursMiddleware_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperatingHoursMiddleware = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const operating_hours_service_1 = require("../../system/operating-hours.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const branding_1 = require("../constants/branding");
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function normalizePath(url) {
    const path = url.split('?')[0] ?? '';
    if (path.length > 1 && path.endsWith('/')) {
        return path.slice(0, -1);
    }
    return path;
}
function isAllowlisted(path) {
    if (path === '/api/auth/login')
        return true;
    if (path === '/api/payments/callback')
        return true;
    if (path === '/api/system/operating-status')
        return true;
    return false;
}
function extractBearerToken(req) {
    const header = req.headers['authorization'];
    if (typeof header !== 'string')
        return null;
    const [scheme, token] = header.split(' ');
    if (!scheme || !token)
        return null;
    if (scheme.toLowerCase() !== 'bearer')
        return null;
    return token.trim() || null;
}
let OperatingHoursMiddleware = OperatingHoursMiddleware_1 = class OperatingHoursMiddleware {
    hours;
    jwt;
    prisma;
    logger = new common_1.Logger(OperatingHoursMiddleware_1.name);
    constructor(hours, jwt, prisma) {
        this.hours = hours;
        this.jwt = jwt;
        this.prisma = prisma;
    }
    use(req, res, next) {
        if (!this.hours.isLockEnabled()) {
            next();
            return;
        }
        const method = req.method.toUpperCase();
        if (!MUTATING.has(method)) {
            next();
            return;
        }
        const path = normalizePath(req.originalUrl ?? req.url ?? '');
        if (isAllowlisted(path)) {
            next();
            return;
        }
        if (this.hours.isWithinOperatingWindow()) {
            next();
            return;
        }
        const ownerPayload = this.tryDecodeOwner(req);
        if (ownerPayload) {
            this.recordMasterOverrideAudit(ownerPayload, method, path).catch((err) => {
                this.logger.warn(`[OPS] failed to record MASTER_OVERRIDE audit for owner ${ownerPayload.sub}: ${String(err)}`);
            });
            next();
            return;
        }
        res.status(403).json({
            meta: { application: branding_1.APP_BRAND },
            statusCode: 403,
            message: 'Operations are only allowed between 07:00 and 23:00 Kuwait time (Safari Express operating hours).',
            errorCode: 'SYSTEM_CLOSED',
            timestamp: new Date().toISOString(),
        });
    }
    tryDecodeOwner(req) {
        const token = extractBearerToken(req);
        if (!token)
            return null;
        try {
            const decoded = this.jwt.verify(token);
            if (decoded && decoded.role === 'OWNER') {
                return decoded;
            }
            return null;
        }
        catch {
            return null;
        }
    }
    async recordMasterOverrideAudit(payload, method, path) {
        await this.prisma.auditLog.create({
            data: {
                userId: payload.sub,
                action: 'MASTER_OVERRIDE',
                resource: path,
                changes: {
                    method,
                    path,
                    role: payload.role,
                    branchId: payload.branchId ?? null,
                    kuwaitTime: new Date().toLocaleString('en-GB', {
                        timeZone: 'Asia/Kuwait',
                        hour12: false,
                    }),
                },
            },
        });
    }
};
exports.OperatingHoursMiddleware = OperatingHoursMiddleware;
exports.OperatingHoursMiddleware = OperatingHoursMiddleware = OperatingHoursMiddleware_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [operating_hours_service_1.OperatingHoursService,
        jwt_1.JwtService,
        prisma_service_1.PrismaService])
], OperatingHoursMiddleware);
//# sourceMappingURL=operating-hours.middleware.js.map