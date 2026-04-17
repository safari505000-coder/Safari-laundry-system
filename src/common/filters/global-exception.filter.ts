import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { APP_BRAND } from '../constants/branding';
import {
  logServerError,
  prismaClientMessage,
} from './prisma-exception.util';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const headerId = req.headers['x-request-id'];
    const requestId =
      req.requestId ??
      (typeof headerId === 'string' ? headerId : undefined) ??
      (Array.isArray(headerId) ? headerId[0] : undefined);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException)) {
      logServerError('GlobalExceptionFilter', exception);
    }

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: prismaClientMessage(exception) };

    const meta = { application: APP_BRAND };
    const rid =
      requestId !== undefined ? { requestId: String(requestId) } : {};
    const payload =
      typeof body === 'string'
        ? {
            meta,
            statusCode: status,
            message: body,
            timestamp: new Date().toISOString(),
            ...rid,
          }
        : {
            meta,
            statusCode: status,
            ...(typeof body === 'object' && body !== null ? body : {}),
            timestamp: new Date().toISOString(),
            ...rid,
          };

    httpAdapter.reply(ctx.getResponse(), payload, status);
  }
}
