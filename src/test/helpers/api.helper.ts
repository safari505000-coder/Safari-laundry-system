import '../setup/load-env-test';
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { BrandingResponseInterceptor } from '../../common/interceptors/branding-response.interceptor';
import { HttpAdapterHost } from '@nestjs/core';

export async function createTestApp(): Promise<INestApplication<App>> {
  process.env.NODE_ENV = 'test';
  process.env.SYSTEM_GUARDIAN_ENABLED = '0';
  process.env.BCRYPT_WORKERS = '0';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/safari_erp_test';

  const { AppModule } = await import('../../app.module');

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
  const close = app.close.bind(app);
  app.close = async () => {
    try {
      await close();
    } catch (error) {
      if (
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING'
      ) {
        return;
      }
      throw error;
    }
  };
  return app;
}

export function getAuthHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export { request };
