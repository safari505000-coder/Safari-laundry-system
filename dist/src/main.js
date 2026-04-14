"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const branding_1 = require("./common/constants/branding");
const global_exception_filter_1 = require("./common/filters/global-exception.filter");
const branding_response_interceptor_1 = require("./common/interceptors/branding-response.interceptor");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const httpAdapterHost = app.get(core_1.HttpAdapterHost);
    app.setGlobalPrefix('api');
    app.enableCors({
        origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
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
        .addTag('auth', `Corporate authentication — ${branding_1.APP_BRAND}`)
        .addTag('users', `Employee directory — ${branding_1.APP_BRAND}`)
        .addTag('permissions', `Roles and permissions — ${branding_1.APP_BRAND}`)
        .addTag('reports', `Management reports — ${branding_1.APP_BRAND} (JWT; OWNER/MANAGER only)`)
        .addTag('orders', `Order core — ${branding_1.APP_BRAND} (JWT; RBAC for create, assign, status, dashboard)`)
        .addTag('laundry-price-list', `Garment tariff (KD) — ${branding_1.APP_BRAND} (JWT; price list for order lines)`)
        .addTag('pos', `Driver point-of-sale — ${branding_1.APP_BRAND} (JWT; DRIVER only — customers + checkout)`)
        .addTag('finance', `Cash custody & driver shifts — ${branding_1.APP_BRAND} (JWT; OWNER/MANAGER)`)
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('docs', app, document);
    const parsed = Number.parseInt(process.env.PORT ?? '3000', 10);
    const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
    await app.listen(port, '0.0.0.0');
}
void bootstrap();
//# sourceMappingURL=main.js.map