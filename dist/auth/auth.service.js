"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const crypto = __importStar(require("node:crypto"));
const finance_service_1 = require("../finance/finance.service");
const prisma_service_1 = require("../prisma/prisma.service");
const kuwait_time_1 = require("../common/time/kuwait-time");
const operating_hours_service_1 = require("../system/operating-hours.service");
const bcrypt_service_1 = require("./bcrypt.service");
const INSTITUTIONAL_ROLES = [
    client_1.SafariRole.OWNER,
    client_1.SafariRole.GENERAL_MANAGER,
    client_1.SafariRole.MANAGER,
    client_1.SafariRole.DRIVER,
    client_1.SafariRole.WORKER,
    client_1.SafariRole.CALL_CENTER,
    client_1.SafariRole.CALL_CENTER_SUPERVISOR,
    client_1.SafariRole.FLEET_SUPERVISOR,
    client_1.SafariRole.ACCOUNTANT,
    client_1.SafariRole.SUPERVISOR,
    client_1.SafariRole.VIEWER,
];
const FIELD_OPERATOR_ROLES = [
    client_1.SafariRole.DRIVER,
    client_1.SafariRole.MANAGER,
];
const FIELD_OPERATOR_WINDOW_START_HOUR = 7;
const ACCESS_TOKEN_TTL = process.env.AUTH_ACCESS_TOKEN_TTL ?? '15m';
const REFRESH_TOKEN_DAYS = Number.parseInt(process.env.AUTH_REFRESH_TOKEN_DAYS ?? '7', 10);
function isWorkingHoursBypassed() {
    const raw = (process.env.AUTH_BYPASS_WORKING_HOURS ?? '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}
function sha256Hex(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}
function generateRefreshTokenRaw() {
    return crypto.randomBytes(48).toString('base64url');
}
let AuthService = AuthService_1 = class AuthService {
    prisma;
    jwt;
    financeService;
    bcryptService;
    operatingHours;
    logger = new common_1.Logger(AuthService_1.name);
    constructor(prisma, jwt, financeService, bcryptService, operatingHours) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.financeService = financeService;
        this.bcryptService = bcryptService;
        this.operatingHours = operatingHours;
    }
    async login(dto) {
        const username = dto.username.trim();
        const user = await this.prisma.user.findUnique({
            where: { username },
            include: { role: true },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid username or password');
        }
        if (user.isActive === false) {
            throw new common_1.UnauthorizedException('This account is deactivated');
        }
        const ok = await this.bcryptService.compare(dto.password, user.password);
        if (!ok) {
            throw new common_1.UnauthorizedException('Invalid username or password');
        }
        const roleName = user.role.name;
        if (!INSTITUTIONAL_ROLES.includes(roleName)) {
            throw new common_1.UnauthorizedException('Account role is not authorized');
        }
        if (FIELD_OPERATOR_ROLES.includes(roleName) && this.operatingHours.isLockEnabled()) {
            const hour = (0, kuwait_time_1.kuwaitHour)(new Date());
            const bypass = isWorkingHoursBypassed();
            if (hour < FIELD_OPERATOR_WINDOW_START_HOUR && !bypass) {
                this.recordOutsideHoursAudit(user.id, roleName, hour).catch((err) => {
                    this.logger.warn(`[AUTH] failed to record OUTSIDE_WORKING_HOURS audit for ${user.id}: ${String(err)}`);
                });
                throw new common_1.UnauthorizedException({
                    statusCode: 401,
                    message: 'Login is allowed only between 07:00 and 23:59 Kuwait time for drivers and branch managers.',
                    errorCode: 'OUTSIDE_WORKING_HOURS',
                });
            }
            if (hour < FIELD_OPERATOR_WINDOW_START_HOUR && bypass) {
                this.logger.warn(`[AUTH] working-hours bypass active — ${roleName} ${user.username} ` +
                    `logged in at Kuwait hour ${hour}. Disable AUTH_BYPASS_WORKING_HOURS after diagnostics.`);
            }
        }
        if (user.safariRole !== roleName) {
            await this.prisma.user.update({
                where: { id: user.id },
                data: { safariRole: roleName },
            });
        }
        if (roleName === client_1.SafariRole.DRIVER) {
            await this.financeService.ensureOpenShiftForDriver(user.id);
        }
        const payload = {
            sub: user.id,
            role: roleName,
            branchId: user.branchId ?? undefined,
        };
        const accessToken = await this.jwt.signAsync(payload, {
            expiresIn: ACCESS_TOKEN_TTL,
        });
        const refreshToken = await this.issueRefreshToken(user.id);
        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.fullName,
                phone: user.phone,
                safariRole: roleName,
                branchId: user.branchId,
            },
        };
    }
    async refreshAccessToken(rawToken) {
        const tokenHash = sha256Hex(rawToken);
        const row = await this.prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: { include: { role: true } } },
        });
        if (!row) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        if (row.revokedAt) {
            throw new common_1.UnauthorizedException('Refresh token revoked');
        }
        if (row.expiresAt <= new Date()) {
            throw new common_1.UnauthorizedException('Refresh token expired');
        }
        if (row.usedAt) {
            await this.prisma.refreshToken.updateMany({
                where: { userId: row.userId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            this.logger.warn(`[AUTH] refresh-token replay detected for user ${row.userId}; revoking all sessions.`);
            throw new common_1.UnauthorizedException('Refresh token replay detected');
        }
        const user = row.user;
        if (user.isActive === false) {
            await this.prisma.refreshToken.update({
                where: { id: row.id },
                data: { revokedAt: new Date() },
            });
            throw new common_1.UnauthorizedException('This account is deactivated');
        }
        const roleName = user.role.name;
        const payload = {
            sub: user.id,
            role: roleName,
            branchId: user.branchId ?? undefined,
        };
        const accessToken = await this.jwt.signAsync(payload, {
            expiresIn: ACCESS_TOKEN_TTL,
        });
        const newRaw = generateRefreshTokenRaw();
        const newHash = sha256Hex(newRaw);
        const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
        await this.prisma.$transaction([
            this.prisma.refreshToken.create({
                data: {
                    userId: user.id,
                    tokenHash: newHash,
                    expiresAt: newExpiresAt,
                },
            }),
            this.prisma.refreshToken.update({
                where: { id: row.id },
                data: {
                    usedAt: new Date(),
                },
            }),
        ]);
        return { accessToken, refreshToken: newRaw };
    }
    async revokeRefreshToken(rawToken) {
        const tokenHash = sha256Hex(rawToken);
        await this.prisma.refreshToken
            .updateMany({
            where: { tokenHash, revokedAt: null },
            data: { revokedAt: new Date() },
        })
            .catch(() => undefined);
    }
    async issueRefreshToken(userId) {
        const raw = generateRefreshTokenRaw();
        const hash = sha256Hex(raw);
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
        await this.prisma.refreshToken.create({
            data: { userId, tokenHash: hash, expiresAt },
        });
        return raw;
    }
    async recordOutsideHoursAudit(userId, role, kuwaitHourValue) {
        await this.prisma.auditLog.create({
            data: {
                userId,
                action: 'OUTSIDE_WORKING_HOURS',
                resource: '/api/auth/login',
                changes: {
                    role,
                    kuwaitHour: kuwaitHourValue,
                    kuwaitTime: new Date().toLocaleString('en-GB', {
                        timeZone: 'Asia/Kuwait',
                        hour12: false,
                    }),
                },
            },
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        finance_service_1.FinanceService,
        bcrypt_service_1.BcryptService,
        operating_hours_service_1.OperatingHoursService])
], AuthService);
//# sourceMappingURL=auth.service.js.map