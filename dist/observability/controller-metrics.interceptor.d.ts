import { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { MetricsService } from './metrics.service';
export declare class ControllerMetricsInterceptor implements NestInterceptor {
    private readonly metrics;
    constructor(metrics: MetricsService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown>;
    private observe;
}
