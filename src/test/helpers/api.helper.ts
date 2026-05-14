import 'reflect-metadata';
import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../app.module';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { BrandingResponseInterceptor } from '../../common/interceptors/branding-response.interceptor';
import { HttpAdapterHost } from '@nestjs/core';

export async function createTestApp(): Promise<INestApplication<App>> {
  process.env.NODE_ENV = 'test';
  process.env.SYSTEM_GUARDIAN_ENABLED = '0';
  process.env.BCRYPT_WORKERS = '0';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://user:pass@localhost:5432/safari_erp_test';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
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
  app.useGlobalFilters(new GlobalExceptionFilter(app.get(HttpAdapterHost)));
  app.useGlobalInterceptors(new BrandingResponseInterceptor());

  await app.init();
  return app;
}

export function getAuthHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export { request };
