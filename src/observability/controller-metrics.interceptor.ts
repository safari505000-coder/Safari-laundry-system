import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class ControllerMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const started = performance.now();
    return next.handle().pipe(
      tap({
        next: () => this.observe(req, res, started),
        error: () => this.observe(req, res, started),
      }),
    );
  }

  private observe(req: Request, res: Response, started: number): void {
    const route = req.route?.path ?? req.path ?? req.url ?? 'unknown';
    this.metrics.controllerDuration
      .labels(req.method ?? 'UNKNOWN', String(route), String(res.statusCode ?? 0))
      .observe(performance.now() - started);
  }
}
