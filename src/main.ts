import 'reflect-metadata';
import './tracing';
import 'dotenv/config';
import * as Sentry from '@sentry/node';
import * as bcrypt from 'bcrypt';
import helmet from 'helmet';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SafariRole } from '@prisma/client';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'node:path';
import * as express from 'express';
import { AppModule } from './app.module';
import { JsonConsoleLogger } from './common/logging/json-logger';

// Dastur §8 — Sentry observability (Stage-G). Initialised before the
// Nest factory so early bootstrap failures still get captured. No-op
// when SENTRY_DSN is unset so local dev remains quiet.
const sentryDsn = process.env.SENTRY_DSN?.trim();
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number.parseFloat(
      process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1',
    ),
  });
  Logger.log('Sentry initialised (backend)', 'Bootstrap');
}
import { validateProductionConfig, validateProductionConnectivity } from './bootstrap/validate-production-config';
import { assertProductionJwtSecret } from './bootstrap/assert-production-jwt-secret';
import { ensureDefaultPriceList } from './bootstrap/ensure-default-price-list';
import { APP_BRAND, APP_BRAND_ERP } from './common/constants/branding';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { BrandingResponseInterceptor } from './common/interceptors/branding-response.interceptor';
import { PrismaService } from './prisma/prisma.service';
import { ReadinessService } from './health/readiness.service';
import { APP_VERSION } from './common/constants/app-version';
import { MetricsService } from './observability/metrics.service';
import { validatePermissionCoverage } from './auth/permissions/validate-permissions';
import { logDebugCustomer360Routes } from './bootstrap/log-express-routes';

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';
const DEFAULT_ADMIN_FULL_NAME = 'System Administrator';

/** Core roles (explicit bootstrap list). `Role.name` matches `SafariRole` enum strings. */
const REQUIRED_ROLE_NAMES = [
  'OWNER',
  'MANAGER',
  'DRIVER',
  'WORKER',
] as const;

/** Remaining institutional roles the app expects in `Role` for JWT / RBAC. */
const ADDITIONAL_INSTITUTIONAL_ROLE_NAMES = [
  'GENERAL_MANAGER',
  'CALL_CENTER',
  // V19.9 — CALL_CENTER_SUPERVISOR must exist as a `Role` row on every
  // fresh deploy so `users.service.resolveRoleId` can resolve the FK.
  'CALL_CENTER_SUPERVISOR',
  // V19.10 — FLEET_SUPERVISOR (مسؤول السيارات). Same requirement.
  'FLEET_SUPERVISOR',
  'ACCOUNTANT',
  'SUPERVISOR',
  'VIEWER',
] as const;

/**
 * Prisma has no `safariRole` model — institutional roles live in `Role` with `name` = enum value.
 */
async function ensureInstitutionalRoles(prisma: PrismaService): Promise<void> {
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

async function ensureDefaultOwner(prisma: PrismaService): Promise<void> {
  const ownerRole = await prisma.role.findUniqueOrThrow({
    where: { name: SafariRole.OWNER },
  });

  const existingAdmin = await prisma.user.findUnique({
    where: { username: DEFAULT_ADMIN_USERNAME },
    select: { id: true },
  });

  if (existingAdmin) {
    return;
  }

  // V19.12 — bcrypt cost lowered 12 → 10 (still above OWASP minimum of 10)
  // to keep login / onboarding throughput within the target envelope.
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  await prisma.user.create({
    data: {
      username: DEFAULT_ADMIN_USERNAME,
      password: passwordHash,
      fullName: DEFAULT_ADMIN_FULL_NAME,
      safariRole: SafariRole.OWNER,
      roleId: ownerRole.id,
    },
  });
}

async function bootstrap() {
  validateProductionConfig();
  validatePermissionCoverage();
  /** Default Nest/express.json limit is 100kb — fuel receipts are data URLs and exceed it, yielding a misleading 404. */
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: new JsonConsoleLogger('Bootstrap'),
  });
  app.enableShutdownHooks();
  Logger.log(`APP_VERSION: ${APP_VERSION}`, 'Bootstrap');
  // Never use @nestjs/serve-static for /uploads — it registers a `{*any}` GET that
  // serves `uploads/index.html` on 404, breaking missing/deposit slip URLs with a
  // misleading ENOENT. Raw express.static is enough (same as the old static only).
  app.use(
    '/uploads',
    express.static(join(process.cwd(), 'uploads'), {
      index: false,
      fallthrough: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // V19.12 — hardening:
  //   * helmet() applies a safe baseline of HTTP security headers
  //     (HSTS, X-Content-Type-Options, Referrer-Policy, X-DNS-Prefetch-Control,
  //     etc.). CSP is disabled here because Swagger UI inlines scripts; if we
  //     ever lock that behind /docs we can re-enable contentSecurityPolicy.
  //   * `trust proxy` makes Express pick up the real client IP from
  //     X-Forwarded-For so the per-IP throttler actually rate-limits
  //     individual attackers instead of the proxy IP.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.set('trust proxy', true);
  const metrics = app.get(MetricsService);
  app.use('/metrics', async (_req, res) => {
    res.setHeader('Content-Type', metrics.registry.contentType);
    res.send(await metrics.prometheus());
  });
  app.use('/health', (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ status: 'method_not_allowed' });
      return;
    }
    res.status(200).json({
      status: 'ok',
      service: process.env.OTEL_SERVICE_NAME ?? 'safari-erp-api',
    });
  });
  app.use('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.use('/health/ready', async (_req, res) => {
    try {
      const readiness = app.get(ReadinessService);
      const r = await readiness.check();
      res.status(r.ok ? 200 : 503).json(r);
    } catch {
      res.status(503).json({ ok: false, status: 'unavailable' });
    }
  });
  const httpAdapterHost = app.get(HttpAdapterHost);
  const prisma = app.get(PrismaService);

  await validateProductionConnectivity(prisma);

  await ensureInstitutionalRoles(prisma);
  await ensureDefaultPriceList(prisma);
  await ensureDefaultOwner(prisma);
  assertProductionJwtSecret();

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: (
      process.env.CORS_ORIGIN ??
      'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5178,http://127.0.0.1:5178'
    )
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  });

  /** Global input safety: class-validator + class-transformer on all DTOs. */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
        exposeDefaultValues: true,
      },
      disableErrorMessages: false,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter(httpAdapterHost));
  app.useGlobalInterceptors(new BrandingResponseInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle(APP_BRAND_ERP)
    .setDescription(
      `${APP_BRAND} — corporate ERP. **Global validation** (class-validator + class-transformer) runs on every request body. **Orders**: Kuwait customer phone format, strictly positive totals, optional line-item reconciliation, and legal status transitions are enforced server-side. Authenticate via **auth/login**, then **Authorize**.`,
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Paste accessToken from POST /api/auth/login',
        in: 'header',
      },
      'bearer',
    )
    .addTag('health', `Core endpoints — ${APP_BRAND}`)
    .addTag('system', `Public status — ${APP_BRAND} (operating hours)`)
    .addTag('expenses', `Branch expenses — ${APP_BRAND} (MANAGER/OWNER)`)
    .addTag('auth', `Corporate authentication — ${APP_BRAND}`)
    .addTag('users', `Employee directory — ${APP_BRAND}`)
    .addTag('permissions', `Roles and permissions — ${APP_BRAND}`)
    .addTag(
      'reports',
      `Management reports — ${APP_BRAND} (JWT; OWNER/MANAGER only)`,
    )
    .addTag(
      'orders',
      `Order core — ${APP_BRAND} (JWT; RBAC for create, assign, status, dashboard)`,
    )
    .addTag(
      'laundry-price-list',
      `Garment tariff (KD) — ${APP_BRAND} (JWT; price list for order lines)`,
    )
    .addTag(
      'pos',
      `Driver point-of-sale — ${APP_BRAND} (JWT; DRIVER only — customers + checkout)`,
    )
    .addTag(
      'payments',
      `Kuwait Gateway webhooks — ${APP_BRAND} (public callback; signed with PAYMENTS_SECRET)`,
    )
    .addTag(
      'finance',
      `Cash custody & driver shifts — ${APP_BRAND} (JWT; OWNER/MANAGER)`,
    )
    .addTag('payroll', `Payroll — ${APP_BRAND} (OWNER/MANAGER)`)
    .addTag('fixed-expenses', `Recurring fixed costs — ${APP_BRAND}`)
    .addTag('branches', `Branches — ${APP_BRAND}`)
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const parsed = Number.parseInt(process.env.PORT ?? '3000', 10);
  const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
  await app.listen(port, '0.0.0.0');
  logDebugCustomer360Routes(app);
}
void bootstrap();
