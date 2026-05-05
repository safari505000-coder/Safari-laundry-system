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
var CashWritePoliceGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashWritePoliceGuard = exports.CASH_WRITE_ENDPOINT_KEY = void 0;
exports.CashWriteEndpoint = CashWriteEndpoint;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
exports.CASH_WRITE_ENDPOINT_KEY = 'cash-write-endpoint:roles';
function CashWriteEndpoint(...allowedRoles) {
    if (allowedRoles.length === 0) {
        throw new Error('CashWriteEndpoint requires at least one allowed role — empty allowlist would silently reject every caller.');
    }
    return (0, common_1.SetMetadata)(exports.CASH_WRITE_ENDPOINT_KEY, allowedRoles);
}
const FORBIDDEN_OVERRIDE_KEYS = [
    'cashAmount',
    'cashAmountKd',
    'cashAmountOverride',
    'heldCashKd',
    'cashTodayKd',
    'totalCash',
    'totalCashKd',
    'totalCashInFlight',
    'driverCashKd',
    'driverCash',
    'classifiedAmount',
];
let CashWritePoliceGuard = CashWritePoliceGuard_1 = class CashWritePoliceGuard {
    reflector;
    logger = new common_1.Logger(CashWritePoliceGuard_1.name);
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const allowedRoles = this.reflector.getAllAndOverride(exports.CASH_WRITE_ENDPOINT_KEY, [context.getHandler(), context.getClass()]);
        if (!allowedRoles || allowedRoles.length === 0)
            return true;
        const req = context.switchToHttp().getRequest();
        const user = req.user;
        if (!user) {
            this.logger.error(JSON.stringify({
                event: 'cash_write_blocked',
                reason: 'no_user',
                method: req.method,
                url: req.url,
            }));
            throw new common_1.ForbiddenException('SSoT VIOLATION — OPERATION BLOCKED');
        }
        const actorRole = user.role;
        if (!allowedRoles.includes(actorRole)) {
            this.logger.error(JSON.stringify({
                event: 'cash_write_blocked',
                reason: 'role_not_allowed',
                method: req.method,
                url: req.url,
                actorRole: user.role,
                allowedRoles,
            }));
            throw new common_1.ForbiddenException('SSoT VIOLATION — OPERATION BLOCKED');
        }
        const body = (req.body ?? {});
        const offenders = [];
        for (const key of FORBIDDEN_OVERRIDE_KEYS) {
            if (key in body)
                offenders.push(key);
        }
        if (offenders.length > 0) {
            this.logger.error(JSON.stringify({
                event: 'cash_write_blocked',
                reason: 'forbidden_cash_override',
                method: req.method,
                url: req.url,
                actorRole: user.role,
                offendingFields: offenders,
            }));
            throw new common_1.ForbiddenException('SSoT VIOLATION — OPERATION BLOCKED');
        }
        return true;
    }
};
exports.CashWritePoliceGuard = CashWritePoliceGuard;
exports.CashWritePoliceGuard = CashWritePoliceGuard = CashWritePoliceGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], CashWritePoliceGuard);
//# sourceMappingURL=cash-write-police.guard.js.map