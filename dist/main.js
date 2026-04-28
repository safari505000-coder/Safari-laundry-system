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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
require("dotenv/config");
const Sentry = __importStar(require("@sentry/node"));
const bcrypt = __importStar(require("bcrypt"));
const helmet_1 = __importDefault(require("helmet"));
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const client_1 = require("@prisma/client");
const swagger_1 = require("@nestjs/swagger");
const node_path_1 = require("node:path");
const express = __importStar(require("express"));
const app_module_1 = require("./app.module");
const sentryDsn = process.env.SENTRY_DSN?.trim();
if (sentryDsn) {
    Sentry.init({
        dsn: sentryDsn,
        environment: process.env.NODE_ENV ?? 'development',
        release: process.env.SENTRY_RELEASE,
        tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    });
    common_1.Logger.log('Sentry initialised (backend)', 'Bootstrap');
}
const assert_production_jwt_secret_1 = require("./bootstrap/assert-production-jwt-secret");
const ensure_default_price_list_1 = require("./bootstrap/ensure-default-price-list");
const branding_1 = require("./common/constants/branding");
const global_exception_filter_1 = require("./common/filters/global-exception.filter");
const branding_response_interceptor_1 = require("./common/interceptors/branding-response.interceptor");
const prisma_service_1 = require("./prisma/prisma.service");
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';
const DEFAULT_ADMIN_FULL_NAME = 'System Administrator';
const REQUIRED_ROLE_NAMES = [
    'OWNER',
    'MANAGER',
    'DRIVER',
    'WORKER',
];
const ADDITIONAL_INSTITUTIONAL_ROLE_NAMES = [
    'GENERAL_MANAGER',
    'CALL_CENTER',
    'CALL_CENTER_SUPERVISOR',
    'FLEET_SUPERVISOR',
    'ACCOUNTANT',
    'SUPERVISOR',
    'VIEWER',
];
async function ensureInstitutionalRoles(prisma) {
    await prisma.$connect();
    for (const roleName of REQUIRED_ROLE_NAMES) {
        await prisma.role.upsert({
            where: { name: roleName },
            create: { name: roleName },
            update: {},
        });
        console.log(`Role ${roleName} ensured`);
    }
    for (const roleName of ADDITIONAL_INSTITUTIONAL_ROLE_NAMES) {
        await prisma.role.upsert({
            where: { name: roleName },
            create: { name: roleName },
            update: {},
        });
        console.log(`Role ${roleName} ensured`);
    }
}
async function ensureDefaultOwner(prisma) {
    const ownerRole = await prisma.role.findUniqueOrThrow({
        where: { name: client_1.SafariRole.OWNER },
    });
    const existingAdmin = await prisma.user.findUnique({
        where: { username: DEFAULT_ADMIN_USERNAME },
        select: { id: true },
    });
    if (existingAdmin) {
        return;
    }
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    await prisma.user.create({
        data: {
            username: DEFAULT_ADMIN_USERNAME,
            password: passwordHash,
            fullName: DEFAULT_ADMIN_FULL_NAME,
            safariRole: client_1.SafariRole.OWNER,
            roleId: ownerRole.id,
        },
    });
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        bodyParser: false,
    });
    app.use('/uploads', express.static((0, node_path_1.join)(process.cwd(), 'uploads'), {
        index: false,
        fallthrough: true,
    }));
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));
    app.set('trust proxy', true);
    const httpAdapterHost = app.get(core_1.HttpAdapterHost);
    const prisma = app.get(prisma_service_1.PrismaService);
    await ensureInstitutionalRoles(prisma);
    await (0, ensure_default_price_list_1.ensureDefaultPriceList)(prisma);
    await ensureDefaultOwner(prisma);
    (0, assert_production_jwt_secret_1.assertProductionJwtSecret)();
    app.setGlobalPrefix('api');
    app.enableCors({
        origin: (process.env.CORS_ORIGIN ??
            'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5178,http://127.0.0.1:5178')
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean),
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
            exposeDefaultValues: true,
        },
        disableErrorMessages: false,
    }));
    app.useGlobalFilters(new global_exception_filter_1.GlobalExceptionFilter(httpAdapterHost));
    app.useGlobalInterceptors(new branding_response_interceptor_1.BrandingResponseInterceptor());
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle(branding_1.APP_BRAND_ERP)
        .setDescription(`${branding_1.APP_BRAND} — corporate ERP. **Global validation** (class-validator + class-transformer) runs on every request body. **Orders**: Kuwait customer phone format, strictly positive totals, optional line-item reconciliation, and legal status transitions are enforced server-side. Authenticate via **auth/login**, then **Authorize**.`)
        .setVersion('1.0')
        .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Paste accessToken from POST /api/auth/login',
        in: 'header',
    }, 'bearer')
        .addTag('health', `Core endpoints — ${branding_1.APP_BRAND}`)
        .addTag('system', `Public status — ${branding_1.APP_BRAND} (operating hours)`)
        .addTag('expenses', `Branch expenses — ${branding_1.APP_BRAND} (MANAGER/OWNER)`)
        .addTag('auth', `Corporate authentication — ${branding_1.APP_BRAND}`)
        .addTag('users', `Employee directory — ${branding_1.APP_BRAND}`)
        .addTag('permissions', `Roles and permissions — ${branding_1.APP_BRAND}`)
        .addTag('reports', `Management reports — ${branding_1.APP_BRAND} (JWT; OWNER/MANAGER only)`)
        .addTag('orders', `Order core — ${branding_1.APP_BRAND} (JWT; RBAC for create, assign, status, dashboard)`)
        .addTag('laundry-price-list', `Garment tariff (KD) — ${branding_1.APP_BRAND} (JWT; price list for order lines)`)
        .addTag('pos', `Driver point-of-sale — ${branding_1.APP_BRAND} (JWT; DRIVER only — customers + checkout)`)
        .addTag('payments', `Kuwait Gateway webhooks — ${branding_1.APP_BRAND} (public callback; signed with PAYMENTS_SECRET)`)
        .addTag('finance', `Cash custody & driver shifts — ${branding_1.APP_BRAND} (JWT; OWNER/MANAGER)`)
        .addTag('payroll', `Payroll — ${branding_1.APP_BRAND} (OWNER/MANAGER)`)
        .addTag('fixed-expenses', `Recurring fixed costs — ${branding_1.APP_BRAND}`)
        .addTag('branches', `Branches — ${branding_1.APP_BRAND}`)
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('docs', app, document);
    const parsed = Number.parseInt(process.env.PORT ?? '3000', 10);
    const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
    await app.listen(port, '0.0.0.0');
}
void bootstrap();
//# sourceMappingURL=main.js.map