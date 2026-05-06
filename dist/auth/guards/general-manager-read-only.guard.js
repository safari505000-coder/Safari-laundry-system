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
exports.GeneralManagerReadOnlyGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const client_1 = require("@prisma/client");
const roles_decorator_1 = require("../decorators/roles.decorator");
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
function normalizedPath(req) {
    const raw = (typeof req.originalUrl === 'string' && req.originalUrl) ||
        (typeof req.url === 'string' && req.url) ||
        (typeof req.path === 'string' && req.path) ||
        '';
    return raw.split('?')[0] ?? '';
}
let GeneralManagerReadOnlyGuard = class GeneralManagerReadOnlyGuard {
    reflector;
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(roles_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }
        const req = context.switchToHttp().getRequest();
        const role = req.user?.role;
        if (role !== client_1.SafariRole.GENERAL_MANAGER) {
            return true;
        }
        const method = (req.method ?? 'GET').toUpperCase();
        if (READ_METHODS.has(method)) {
            return true;
        }
        const path = normalizedPath(req);
        if (method === 'POST' && path.endsWith('/auth/change-password')) {
            return true;
        }
        throw new common_1.ForbiddenException('GENERAL_MANAGER is read-only.');
    }
};
exports.GeneralManagerReadOnlyGuard = GeneralManagerReadOnlyGuard;
exports.GeneralManagerReadOnlyGuard = GeneralManagerReadOnlyGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], GeneralManagerReadOnlyGuard);
//# sourceMappingURL=general-manager-read-only.guard.js.map