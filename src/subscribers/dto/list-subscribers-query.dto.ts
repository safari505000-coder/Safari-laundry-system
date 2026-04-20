import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
