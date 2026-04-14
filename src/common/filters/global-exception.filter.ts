import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { APP_BRAND } from '../constants/branding';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    const meta = { application: APP_BRAND };
    const payload =
      typeof body === 'string'
        ? {
            meta,
            statusCode: status,
            message: body,
            timestamp: new Date().toISOString(),
          }
        : {
            meta,
            statusCode: status,
            ...(typeof body === 'object' && body !== null ? body : {}),
            timestamp: new Date().toISOString(),
          };

    httpAdapter.reply(ctx.getResponse(), payload, status);
  }
}
