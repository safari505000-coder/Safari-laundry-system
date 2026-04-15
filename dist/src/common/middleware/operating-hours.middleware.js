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
exports.OperatingHoursMiddleware = void 0;
const common_1 = require("@nestjs/common");
const operating_hours_service_1 = require("../../system/operating-hours.service");
const branding_1 = require("../constants/branding");
const MUTATING = new Set(['POST', 'PUT', 'PATCH']);
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
let OperatingHoursMiddleware = class OperatingHoursMiddleware {
    hours;
    constructor(hours) {
        this.hours = hours;
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
        res.status(403).json({
            meta: { application: branding_1.APP_BRAND },
            statusCode: 403,
            message: 'Operations are only allowed between 07:00 and 23:00 Kuwait time (Safari Express operating hours).',
            errorCode: 'SYSTEM_CLOSED',
            timestamp: new Date().toISOString(),
        });
    }
};
exports.OperatingHoursMiddleware = OperatingHoursMiddleware;
exports.OperatingHoursMiddleware = OperatingHoursMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [operating_hours_service_1.OperatingHoursService])
], OperatingHoursMiddleware);
//# sourceMappingURL=operating-hours.middleware.js.map