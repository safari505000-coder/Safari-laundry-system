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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcrypt"));
const client_1 = require("@prisma/client");
const finance_service_1 = require("../finance/finance.service");
const prisma_service_1 = require("../prisma/prisma.service");
const INSTITUTIONAL_ROLES = [
    client_1.SafariRole.OWNER,
    client_1.SafariRole.MANAGER,
    client_1.SafariRole.DRIVER,
    client_1.SafariRole.WORKER,
    client_1.SafariRole.CALL_CENTER,
    client_1.SafariRole.ACCOUNTANT,
    client_1.SafariRole.SUPERVISOR,
    client_1.SafariRole.VIEWER,
];
let AuthService = class AuthService {
    prisma;
    jwt;
    financeService;
    constructor(prisma, jwt, financeService) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.financeService = financeService;
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
        const ok = await bcrypt.compare(dto.password, user.password);
        if (!ok) {
            throw new common_1.UnauthorizedException('Invalid username or password');
        }
        const roleName = user.role.name;
        if (!INSTITUTIONAL_ROLES.includes(roleName)) {
            throw new common_1.UnauthorizedException('Account role is not authorized');
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
        const payload = { sub: user.id, role: roleName };
        const accessToken = await this.jwt.signAsync(payload);
        return {
            accessToken,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.fullName,
                phone: user.phone,
                safariRole: roleName,
            },
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        finance_service_1.FinanceService])
], AuthService);
//# sourceMappingURL=auth.service.js.map