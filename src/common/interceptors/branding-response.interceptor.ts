import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { APP_BRAND } from '../constants/branding';

@Injectable()
export class BrandingResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => ({
        meta: { application: APP_BRAND },
        data: data === undefined ? null : data,
      })),
    );
  }
}
