import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { OperatingHoursService } from '../../system/operating-hours.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { APP_BRAND } from '../constants/branding';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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

function extractBearerToken(req: Request): string | null {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

/**
 * Enforces the 07:00–23:00 Kuwait operating window for every mutating request.
 *
 * Two intentional exceptions:
 *   • Allow-listed endpoints (login, payment callback, status probe).
 *   • **OWNER role** holds the master key — requests are let through 24/7 and
 *     any mutation that lands outside standard hours is recorded in `AuditLog`
 *     (action=`MASTER_OVERRIDE`) as a fire-and-forget write so the audit trail
 *     remains intact even if the write fails. Non-OWNER tokens get the normal
 *     403 SYSTEM_CLOSED response.
 */
@Injectable()
export class OperatingHoursMiddleware implements NestMiddleware {
  private readonly logger = new Logger(OperatingHoursMiddleware.name);

  constructor(
    private readonly hours: OperatingHoursService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

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

    // Outside the window — check for OWNER master key before rejecting.
    const ownerPayload = this.tryDecodeOwner(req);
    if (ownerPayload) {
      this.recordMasterOverrideAudit(ownerPayload, method, path).catch(
        (err) => {
          this.logger.warn(
            `[OPS] failed to record MASTER_OVERRIDE audit for owner ${ownerPayload.sub}: ${String(err)}`,
          );
        },
      );
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

  /**
   * Returns the JWT payload iff the caller is authenticated as OWNER. Any
   * decoding / signature failure falls through to `null` so the middleware
   * applies the normal lock to anonymous or invalid-token requests.
   */
  private tryDecodeOwner(req: Request): JwtPayload | null {
    const token = extractBearerToken(req);
    if (!token) return null;
    try {
      const decoded = this.jwt.verify<JwtPayload>(token);
      if (decoded && decoded.role === 'OWNER') {
        return decoded;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async recordMasterOverrideAudit(
    payload: JwtPayload,
    method: string,
    path: string,
  ): Promise<void> {
    // Fire-and-forget — must never block the request path.
    // `MASTER_OVERRIDE` is the canonical audit action for OWNER mutations
    // performed outside the 07:00–23:00 operating window. Any dashboard query
    // filtering by this literal keeps historical parity with the rename.
    await this.prisma.auditLog.create({
      data: {
        userId: payload.sub,
        action: 'MASTER_OVERRIDE',
        resource: path,
        changes: {
          method,
          path,
          role: payload.role,
          branchId: payload.branchId ?? null,
          kuwaitTime: new Date().toLocaleString('en-GB', {
            timeZone: 'Asia/Kuwait',
            hour12: false,
          }),
        },
      },
    });
  }
}
