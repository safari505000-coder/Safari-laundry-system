import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { OperatingHoursService } from '../../system/operating-hours.service';
import { APP_BRAND } from '../constants/branding';

const MUTATING = new Set(['POST', 'PUT', 'PATCH']);

function normalizePath(url: string): string {
  const path = url.split('?')[0] ?? '';
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}

function isAllowlisted(path: string): boolean {
  if (path === '/api/auth/login') return true;
  if (path === '/api/payments/callback') return true;
  if (path === '/api/system/operating-status') return true;
  return false;
}

@Injectable()
export class OperatingHoursMiddleware implements NestMiddleware {
  constructor(private readonly hours: OperatingHoursService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (!this.hours.isLockEnabled()) {
      next();
      return;
    }
    const method = req.method.toUpperCase();
    if (!MUTATING.has(method)) {
      next();
      return;
    }
    const path = normalizePath(req.originalUrl ?? req.url ?? '');
    if (isAllowlisted(path)) {
      next();
      return;
    }
    if (this.hours.isWithinOperatingWindow()) {
      next();
      return;
    }
    res.status(403).json({
      meta: { application: APP_BRAND },
      statusCode: 403,
      message:
        'Operations are only allowed between 07:00 and 23:00 Kuwait time (Safari Express operating hours).',
      errorCode: 'SYSTEM_CLOSED',
      timestamp: new Date().toISOString(),
    });
  }
}
