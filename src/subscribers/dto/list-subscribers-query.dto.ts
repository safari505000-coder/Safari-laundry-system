import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * V19.4 — CC pack point #3 ("قائمة المشتركين برقم التلفون").
 *
 * Optional server-side filter for `GET /api/subscribers`. When `q` is
 * present, the service narrows the Customer query to rows whose phone
 * (or display name) contains the needle, so the call-centre agent can
 * type a mobile number and not wait for the full subscriber list to
 * serialise.
 *
 * Client-side filtering on `subscribers-page.tsx` still runs as a
 * safety net (and for live typing without re-fetch).
 *
 * `q` is intentionally free-form string — it may be "5551", "0079",
 * "Ali", "علي" — the service normalises it two ways:
 *   1. Trim + lowercase + substring on `displayName` / `phone`.
 *   2. Digit-only variant matched against digit-only `phone`.
 */
export class ListSubscribersQueryDto {
  @ApiPropertyOptional({
    description:
      'Optional search needle. Matches display name OR phone (case-insensitive substring + digit-only fallback).',
    example: '97700000',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  q?: string;

  /**
   * V20.3.2 — opt-in to the legacy "ever had a subscription
   * history row" membership semantic. Defaults to `false`
   * (strict membership: only customers with a currently-active
   * `CustomerSubscription` are returned). Useful for back-compat
   * dashboards that still expect to see expired subscribers
   * with historical wallet snapshot data.
   *
   * Whichever value you pass here, debt / payment / wallet
   * state never determines membership — that bug is fixed
   * unconditionally.
   */
  @ApiPropertyOptional({
    description:
      'V20.3.2 — when true, also returns customers with subscription history but no currently-active CustomerSubscription. Default false.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
      if (v === 'false' || v === '0' || v === 'no' || v === 'off') {
        return false;
      }
    }
    return value;
  })
  includeInactive?: boolean;
}
