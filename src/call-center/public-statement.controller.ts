import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/roles.decorator';
import { CallCenterService } from './call-center.service';

/**
 * V19.8.9 — Public (login-less) customer statement endpoint.
 *
 * Shares the Customer 360 ledger for a customer whose ID is embedded
 * in a short-lived, signed JWT. The Call Center agent mints one of
 * these tokens via `POST /call-center/customers/:id/statement-share-link`
 * and forwards the resulting URL on WhatsApp. The customer opens the
 * URL on any device (no login), sees the same A4 statement the agent
 * saw, and can print / save as PDF locally.
 *
 * Security model:
 *   - The token is signed with the main JWT secret but carries
 *     `purpose: 'STATEMENT_SHARE'`, so it cannot be swapped in for an
 *     ordinary session JWT.
 *   - The customerId is READ from the token, never from the URL or
 *     query string, so a holder cannot peek at other customers.
 *   - 7-day TTL — plenty of time for a customer to act on a reminder,
 *     short enough that a leaked URL expires on its own.
 *
 * No guards by design — `VerifyController` in this codebase follows
 * the same public pattern for the HR document QR stamps.
 */
@ApiTags('public-statement')
@Controller('public/statement')
@Public('Signed statement-share token scopes access without a staff JWT.')
// 10 requests / minute / IP — explicit limit since global ceiling is MAX_SAFE_INTEGER.
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class PublicStatementController {
  constructor(private readonly callCenter: CallCenterService) {}

  @Get(':token')
  @ApiOperation({
    summary: 'Read a shared customer statement by signed token',
    description:
      'V19.8.9 — validates the JWT, re-scopes the request to the embedded customer, and returns the same CustomerLedgerResponseDto the authenticated endpoint returns. No auth header required. Throws 404 on expired / malformed / wrong-purpose tokens.',
  })
  getPublic(@Param('token') token: string) {
    return this.callCenter.getPublicStatement(token);
  }
}
