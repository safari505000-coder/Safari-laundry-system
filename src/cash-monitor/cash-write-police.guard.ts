/**
 * CashWritePoliceGuard — defensive write-path enforcement.
 *
 * Today's cash flows enter the system through structured order /
 * payment / settlement workflows that already use Prisma transactions
 * and explicit `@Roles` guards. There is intentionally NO public
 * "edit driver cash" endpoint — and there must never be one.
 *
 * This guard is a SAFETY SCAFFOLD. Any future controller method that
 * touches per-driver cash MUST decorate itself with
 * `@CashWriteEndpoint(...allowedRoles)`. The guard then enforces:
 *
 *   1. Caller's role is in the explicit allowlist for this route
 *      (e.g. DRIVER for settlement-submit, MANAGER for
 *      settlement-approve, ACCOUNTANT for reconciliation). Any other
 *      role → `ForbiddenException('SSoT VIOLATION — OPERATION BLOCKED')`.
 *
 *   2. The request body does NOT contain a free-form override for
 *      any of the SSoT cash fields (see `FORBIDDEN_OVERRIDE_KEYS`).
 *      A driver / manager / accountant submitting a literal
 *      `cashAmount`, `heldCashKd`, etc. is rejected with the same
 *      error. The classifier alone produces those values.
 *
 *   3. A structured log line is emitted for every block so the audit
 *      log retains forensic evidence of the attempt.
 *
 * The guard is idempotent and read-only on the request — it does not
 * mutate the body or enrich the user object.
 *
 * It is registered globally (see `CashMonitorModule`) but is a no-op
 * on routes that do NOT carry the `@CashWriteEndpoint(...)` metadata.
 * That keeps every existing endpoint untouched while giving us a
 * single switch to flip for any future cash-write route.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SafariRole } from '@prisma/client';
import { JwtUser } from '../auth/decorators/current-user.decorator';

export const CASH_WRITE_ENDPOINT_KEY = 'cash-write-endpoint:roles';

/**
 * Mark a controller method as a cash-touching write endpoint and pin
 * the exact list of roles allowed to invoke it.
 *
 * Usage:
 *   @Post('settlement')
 *   @CashWriteEndpoint(SafariRole.DRIVER)
 *   submitSettlement(@CurrentUser() user: JwtUser, @Body() dto: ...) { ... }
 */
export function CashWriteEndpoint(...allowedRoles: SafariRole[]) {
  if (allowedRoles.length === 0) {
    throw new Error(
      'CashWriteEndpoint requires at least one allowed role — empty allowlist would silently reject every caller.',
    );
  }
  return SetMetadata(CASH_WRITE_ENDPOINT_KEY, allowedRoles);
}

/**
 * Body keys that operators MUST NOT be able to set directly. Every
 * one of these is owned by `CashClassifierService` and derived from
 * the order/payment/settlement state machine — never from a raw HTTP
 * field. Adding to this list is allowed and intentional; removing
 * requires a written threat model.
 */
const FORBIDDEN_OVERRIDE_KEYS = [
  'cashAmount',
  'cashAmountKd',
  'cashAmountOverride',
  'heldCashKd',
  'cashTodayKd',
  'totalCash',
  'totalCashKd',
  'totalCashInFlight',
  'driverCashKd',
  'driverCash',
  'classifiedAmount',
] as const;

@Injectable()
export class CashWritePoliceGuard implements CanActivate {
  private readonly logger = new Logger(CashWritePoliceGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<
      SafariRole[] | undefined
    >(CASH_WRITE_ENDPOINT_KEY, [context.getHandler(), context.getClass()]);

    // Routes without the @CashWriteEndpoint marker are intentionally
    // out of scope. The policy is opt-in so existing read-only routes
    // are NOT changed.
    if (!allowedRoles || allowedRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<{
      user?: JwtUser;
      body?: Record<string, unknown>;
      method?: string;
      url?: string;
    }>();
    const user = req.user;

    if (!user) {
      this.logger.error(
        JSON.stringify({
          event: 'cash_write_blocked',
          reason: 'no_user',
          method: req.method,
          url: req.url,
        }),
      );
      throw new ForbiddenException('SSoT VIOLATION — OPERATION BLOCKED');
    }

    // `JwtUser.role` is the canonical SafariRole string emitted by
    // the JWT issuer (see auth.service). The decorator types it as
    // a plain string for transport, so we narrow here. Any value
    // outside the SafariRole union still fails the `.includes`
    // check below and is rejected by the same code path.
    const actorRole = user.role as SafariRole;
    if (!allowedRoles.includes(actorRole)) {
      this.logger.error(
        JSON.stringify({
          event: 'cash_write_blocked',
          reason: 'role_not_allowed',
          method: req.method,
          url: req.url,
          actorRole: user.role,
          allowedRoles,
        }),
      );
      throw new ForbiddenException('SSoT VIOLATION — OPERATION BLOCKED');
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const offenders: string[] = [];
    for (const key of FORBIDDEN_OVERRIDE_KEYS) {
      if (key in body) offenders.push(key);
    }

    if (offenders.length > 0) {
      this.logger.error(
        JSON.stringify({
          event: 'cash_write_blocked',
          reason: 'forbidden_cash_override',
          method: req.method,
          url: req.url,
          actorRole: user.role,
          offendingFields: offenders,
        }),
      );
      throw new ForbiddenException('SSoT VIOLATION — OPERATION BLOCKED');
    }

    return true;
  }
}
