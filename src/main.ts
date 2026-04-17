import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SafariRole } from '@prisma/client';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { AppModule } from './app.module';
import { ensureDefaultPriceList } from './bootstrap/ensure-default-price-list';
import { APP_BRAND, APP_BRAND_ERP } from './common/constants/branding';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { BrandingResponseInterceptor } from './common/interceptors/branding-response.interceptor';
import { PrismaService } from './prisma/prisma.service';

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
  'CALL_CENTER',
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

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
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
  /** Default Nest/express.json limit is 100kb — fuel receipts are data URLs and exceed it, yielding a misleading 404. */
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  const httpAdapterHost = app.get(HttpAdapterHost);
  const prisma = app.get(PrismaService);

  await ensureInstitutionalRoles(prisma);
  await ensureDefaultPriceList(prisma);
  await ensureDefaultOwner(prisma);

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
}
void bootstrap();
