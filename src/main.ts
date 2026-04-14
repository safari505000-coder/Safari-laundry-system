import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { SafariRole } from '@prisma/client';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { APP_BRAND, APP_BRAND_ERP } from './common/constants/branding';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { BrandingResponseInterceptor } from './common/interceptors/branding-response.interceptor';
import { PrismaService } from './prisma/prisma.service';

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';
const DEFAULT_ADMIN_FULL_NAME = 'System Administrator';
const BUSINESS_NAME_AR = 'مجموعة مصابغ سفاري السريعة';

type DefaultPriceItem = {
  code: string;
  nameAr: string;
  nameEn: string;
  priceNormal: number;
  priceUrgent: number;
  pricePressOnly: number | null;
  priceUrgentPress: number | null;
};

const DEFAULT_PRICE_ITEMS: readonly DefaultPriceItem[] = [
  {
    code: 'OVER_COAT',
    nameAr: 'بالطو',
    nameEn: 'Over Coat',
    priceNormal: 2.5,
    priceUrgent: 3.0,
    pricePressOnly: 0.75,
    priceUrgentPress: 1.0,
  },
  {
    code: 'JACKET',
    nameAr: 'جاكيت',
    nameEn: 'Jacket',
    priceNormal: 1.75,
    priceUrgent: 2.0,
    pricePressOnly: 0.5,
    priceUrgentPress: 0.75,
  },
  {
    code: 'TROUSERS',
    nameAr: 'بنطلون',
    nameEn: 'Trousers',
    priceNormal: 0.5,
    priceUrgent: 0.75,
    pricePressOnly: 0.25,
    priceUrgentPress: 0.35,
  },
  {
    code: 'SHIRT',
    nameAr: 'قميص',
    nameEn: 'Shirt',
    priceNormal: 0.5,
    priceUrgent: 0.75,
    pricePressOnly: 0.25,
    priceUrgentPress: 0.35,
  },
  {
    code: 'SUIT',
    nameAr: 'بدلة كاملة',
    nameEn: 'Suit',
    priceNormal: 2.25,
    priceUrgent: 3.0,
    pricePressOnly: 0.75,
    priceUrgentPress: 1.0,
  },
  {
    code: 'DISHDASHA_ORD',
    nameAr: 'دشداشة عادي',
    nameEn: 'Dishdasha Ord',
    priceNormal: 0.6,
    priceUrgent: 1.0,
    pricePressOnly: 0.35,
    priceUrgentPress: 0.5,
  },
  {
    code: 'DISHDASHA_WOOL',
    nameAr: 'دشداشة صوف',
    nameEn: 'Dishdasha Wool',
    priceNormal: 0.75,
    priceUrgent: 1.0,
    pricePressOnly: 0.4,
    priceUrgentPress: 0.5,
  },
  {
    code: 'GHOTRA',
    nameAr: 'غترة / شماغ',
    nameEn: 'Ghotra',
    priceNormal: 0.4,
    priceUrgent: 0.5,
    pricePressOnly: 0.25,
    priceUrgentPress: 0.35,
  },
  {
    code: 'OCCASION_BISHT',
    nameAr: 'بشت مناسبات',
    nameEn: 'Occasion Bisht',
    priceNormal: 4.0,
    priceUrgent: 5.0,
    pricePressOnly: 1.0,
    priceUrgentPress: 1.5,
  },
  {
    code: 'ABAYA',
    nameAr: 'عباءة',
    nameEn: 'Abaya',
    priceNormal: 1.25,
    priceUrgent: 1.5,
    pricePressOnly: 0.5,
    priceUrgentPress: 0.75,
  },
  {
    code: 'BATANYA',
    nameAr: 'بطانية',
    nameEn: 'Batanya',
    priceNormal: 1.75,
    priceUrgent: 3.0,
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'COVER',
    nameAr: 'ديباج',
    nameEn: 'Cover',
    priceNormal: 2.5,
    priceUrgent: 4.5,
    pricePressOnly: null,
    priceUrgentPress: null,
  },
];

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

async function ensureDefaultPriceList(prisma: PrismaService): Promise<void> {
  const codes = DEFAULT_PRICE_ITEMS.map((item) => item.code);
  await prisma.laundryPriceListItem.deleteMany({
    where: { code: { notIn: codes } },
  });

  for (const [index, item] of DEFAULT_PRICE_ITEMS.entries()) {
    await prisma.laundryPriceListItem.upsert({
      where: { code: item.code },
      create: {
        code: item.code,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        sortOrder: index + 1,
        manualEntry: false,
        priceNormal: item.priceNormal,
        priceUrgent: item.priceUrgent,
        pricePressOnly: item.pricePressOnly,
        priceUrgentPress: item.priceUrgentPress,
      },
      update: {
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        sortOrder: index + 1,
        manualEntry: false,
        priceNormal: item.priceNormal,
        priceUrgent: item.priceUrgent,
        pricePressOnly: item.pricePressOnly,
        priceUrgentPress: item.priceUrgentPress,
      },
    });
  }

  console.log(
    `[${BUSINESS_NAME_AR}] Default laundry price list ensured (${DEFAULT_PRICE_ITEMS.length} items).`,
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const httpAdapterHost = app.get(HttpAdapterHost);
  const prisma = app.get(PrismaService);

  await ensureInstitutionalRoles(prisma);
  await ensureDefaultPriceList(prisma);
  await ensureDefaultOwner(prisma);

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: (
      process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173'
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
      'finance',
      `Cash custody & driver shifts — ${APP_BRAND} (JWT; OWNER/MANAGER)`,
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const parsed = Number.parseInt(process.env.PORT ?? '3000', 10);
  const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
