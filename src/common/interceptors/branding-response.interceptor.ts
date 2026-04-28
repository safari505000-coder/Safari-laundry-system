import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Readable } from 'stream';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { APP_BRAND } from '../constants/branding';

/**
 * V1.7.2 — Binary-aware global response wrapper.
 *
 * Wraps JSON handlers in `{ meta, data }` for Safari-branded APIs, but
 * transparently passes through binary payloads (PDF receipts, XLSX
 * exports, raw `Buffer`s, Node streams) so the client receives the
 * actual bytes instead of a JSON-serialised `StreamableFile` object.
 *
 * Bug A-49: the /payment/success «تحميل الفاتورة PDF» button rendered
 * escaped JSON because the interceptor JSON-wrapped the `StreamableFile`
 * returned by `PublicInvoiceController`, defeating Nest's binary handler.
 */
@Injectable()
export class BrandingResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        if (isBinaryLikeResponse(data)) {
          return data;
        }
        return {
          meta: { application: APP_BRAND },
          data: data === undefined ? null : data,
        };
      }),
    );
  }
}

function isBinaryLikeResponse(data: unknown): boolean {
  if (data instanceof StreamableFile) return true;
  if (Buffer.isBuffer(data)) return true;
  if (data instanceof Readable) return true;
  return false;
}
