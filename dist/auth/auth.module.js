"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const throttler_1 = require("@nestjs/throttler");
const jwt_secret_fallback_1 = require("../common/constants/jwt-secret-fallback");
const finance_module_1 = require("../finance/finance.module");
const prisma_module_1 = require("../prisma/prisma.module");
const users_module_1 = require("../users/users.module");
const operating_hours_module_1 = require("../system/operating-hours.module");
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const bcrypt_service_1 = require("./bcrypt.service");
const general_manager_read_only_guard_1 = require("./guards/general-manager-read-only.guard");
const password_change_scope_guard_1 = require("./guards/password-change-scope.guard");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
const roles_guard_1 = require("./guards/roles.guard");
const permissions_guard_1 = require("./permissions/permissions.guard");
const jwt_strategy_1 = require("./strategies/jwt.strategy");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            finance_module_1.FinanceModule,
            operating_hours_module_1.OperatingHoursModule,
            users_module_1.UsersModule,
            passport_1.PassportModule.register({ defaultStrategy: 'jwt' }),
            jwt_1.JwtModule.register({
                secret: process.env.JWT_SECRET ?? jwt_secret_fallback_1.JWT_SECRET_DEV_FALLBACK,
                signOptions: {
                    expiresIn: (process.env.AUTH_ACCESS_TOKEN_TTL ?? '15m'),
                },
            }),
            throttler_1.ThrottlerModule.forRoot([
                {
                    name: 'default',
                    ttl: 60_000,
                    limit: Number.parseInt(process.env.THROTTLE_GLOBAL_LIMIT ?? '0', 10) ||
                        Number.MAX_SAFE_INTEGER,
                },
            ]),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [
            auth_service_1.AuthService,
            bcrypt_service_1.BcryptService,
            jwt_strategy_1.JwtStrategy,
            jwt_auth_guard_1.JwtAuthGuard,
            password_change_scope_guard_1.PasswordChangeScopeGuard,
            general_manager_read_only_guard_1.GeneralManagerReadOnlyGuard,
            roles_guard_1.RolesGuard,
            permissions_guard_1.PermissionsGuard,
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_auth_guard_1.JwtAuthGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: password_change_scope_guard_1.PasswordChangeScopeGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: general_manager_read_only_guard_1.GeneralManagerReadOnlyGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: roles_guard_1.RolesGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: permissions_guard_1.PermissionsGuard,
            },
        ],
        exports: [
            auth_service_1.AuthService,
            bcrypt_service_1.BcryptService,
            jwt_1.JwtModule,
            jwt_auth_guard_1.JwtAuthGuard,
            general_manager_read_only_guard_1.GeneralManagerReadOnlyGuard,
            roles_guard_1.RolesGuard,
            permissions_guard_1.PermissionsGuard,
        ],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map