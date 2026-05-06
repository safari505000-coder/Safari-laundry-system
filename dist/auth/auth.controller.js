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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const branding_1 = require("../common/constants/branding");
const audit_logs_service_1 = require("../audit-logs/audit-logs.service");
const current_user_decorator_1 = require("./decorators/current-user.decorator");
const roles_decorator_1 = require("./decorators/roles.decorator");
const roles_decorator_2 = require("./decorators/roles.decorator");
const auth_service_1 = require("./auth.service");
const change_password_body_dto_1 = require("./dto/change-password-body.dto");
const login_dto_1 = require("./dto/login.dto");
const login_response_dto_1 = require("./dto/login-response.dto");
const refresh_token_dto_1 = require("./dto/refresh-token.dto");
let AuthController = class AuthController {
    authService;
    auditLogs;
    constructor(authService, auditLogs) {
        this.authService = authService;
        this.auditLogs = auditLogs;
    }
    async login(dto, req) {
        try {
            const res = await this.authService.login(dto);
            if (res.requiresPasswordChange === true && res.tempToken) {
                this.auditLogs.log({
                    userId: res.user.id,
                    role: res.user.safariRole,
                    action: 'LOGIN_PASSWORD_CHANGE_REQUIRED',
                    resource: 'auth',
                    endpoint: req.originalUrl ?? req.url,
                    method: req.method,
                    status: client_1.AuditStatus.SUCCESS,
                    ip: this.ip(req),
                    userAgent: this.userAgent(req),
                    requestId: req.requestId ?? null,
                });
                return res;
            }
            this.auditLogs.log({
                userId: res.user.id,
                role: res.user.safariRole,
                action: 'LOGIN',
                resource: 'auth',
                endpoint: req.originalUrl ?? req.url,
                method: req.method,
                status: client_1.AuditStatus.SUCCESS,
                ip: this.ip(req),
                userAgent: this.userAgent(req),
                requestId: req.requestId ?? null,
            });
            return res;
        }
        catch (error) {
            this.auditLogs.log({
                action: 'LOGIN',
                resource: 'auth',
                endpoint: req.originalUrl ?? req.url,
                method: req.method,
                status: client_1.AuditStatus.DENIED,
                ip: this.ip(req),
                userAgent: this.userAgent(req),
                requestId: req.requestId ?? null,
                suspicious: true,
                changes: { username: dto.username },
            });
            throw error;
        }
    }
    refresh(dto) {
        return this.authService.refreshAccessToken(dto.refreshToken);
    }
    async logout(dto, req) {
        await this.authService.revokeRefreshToken(dto.refreshToken);
        this.auditLogs.log({
            action: 'LOGOUT',
            resource: 'auth',
            endpoint: req.originalUrl ?? req.url,
            method: req.method,
            status: client_1.AuditStatus.SUCCESS,
            ip: this.ip(req),
            userAgent: this.userAgent(req),
            requestId: req.requestId ?? null,
        });
    }
    async changePassword(jwtUser, dto) {
        return this.authService.changePassword(jwtUser.userId, dto);
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
};
exports.AuthController = AuthController;
__decorate([
    (0, roles_decorator_1.Public)('Login must be reachable before a JWT exists.'),
    (0, common_1.Post)('login'),
    (0, throttler_1.Throttle)({
        default: {
            limit: Number.parseInt(process.env.AUTH_LOGIN_THROTTLE_LIMIT ?? '', 10) || 5,
            ttl: Number.parseInt(process.env.AUTH_LOGIN_THROTTLE_TTL_MS ?? '', 10) ||
                60_000,
        },
    }),
    (0, swagger_1.ApiOperation)({
        summary: `Corporate login (${branding_1.APP_BRAND})`,
        description: 'Authenticate with staff username and password. Returns a short-lived access token (15 min) and an opaque refresh token. Initial OWNER is created by `npm run db:seed` (default username `admin`; override with SEED_ADMIN_USERNAME).',
    }),
    (0, swagger_1.ApiOkResponse)({ type: login_response_dto_1.LoginResponseDto }),
    (0, swagger_1.ApiUnauthorizedResponse)({ description: 'Invalid credentials' }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Validation failed' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, roles_decorator_1.Public)('Refresh-token exchange must work without a valid access JWT.'),
    (0, common_1.Post)('refresh-token'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: `Refresh access token (${branding_1.APP_BRAND})`,
        description: 'Exchange a valid refresh token for a fresh access token. The refresh token is rotated (single-use) — on replay the entire token family for this user is revoked.',
    }),
    (0, swagger_1.ApiOkResponse)({ type: refresh_token_dto_1.RefreshTokenResponseDto }),
    (0, swagger_1.ApiUnauthorizedResponse)({
        description: 'Refresh token invalid, expired, revoked, or replayed',
    }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Validation failed' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_token_dto_1.RefreshTokenRequestDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, roles_decorator_1.Public)('Logout revokes refresh tokens without requiring access JWT.'),
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(204),
    (0, swagger_1.ApiOperation)({
        summary: `Revoke refresh token (${branding_1.APP_BRAND})`,
        description: 'Best-effort revocation of the supplied refresh token. Always returns 204 so malformed tokens do not reveal whether they existed.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_token_dto_1.RefreshTokenRequestDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)('change-password'),
    (0, roles_decorator_2.Roles)(...[...auth_service_1.INSTITUTIONAL_ROLES]),
    (0, throttler_1.Throttle)({
        default: {
            limit: Number.parseInt(process.env.AUTH_CHANGE_PASSWORD_THROTTLE_LIMIT ?? '', 10) || 10,
            ttl: Number.parseInt(process.env.AUTH_CHANGE_PASSWORD_THROTTLE_TTL_MS ?? '', 10) || 60_000,
        },
    }),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: `Change password (${branding_1.APP_BRAND})`,
        description: 'Authenticated users (including PASSWORD_CHANGE_ONLY temp JWT after login). Returns a full access + refresh pair on success.',
    }),
    (0, swagger_1.ApiOkResponse)({ type: login_response_dto_1.LoginResponseDto }),
    (0, swagger_1.ApiUnauthorizedResponse)({ description: 'Wrong current password or JWT' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, change_password_body_dto_1.ChangePasswordBodyDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changePassword", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        audit_logs_service_1.AuditLogsService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map