import { Logger } from '@nestjs/common';
import { JWT_SECRET_DEV_FALLBACK } from '../common/constants/jwt-secret-fallback';

/**
 * V19.27.3 — If production runs with a missing or dev-default `JWT_SECRET`,
 * invoice PDF + share links that were signed in a *different* environment will
 * 404 (Moatmt may save the JSON error body as a ~0.5KB "file"). Log loudly.
 */
export function assertProductionJwtSecret(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  const s = process.env.JWT_SECRET?.trim();
  if (!s || s === JWT_SECRET_DEV_FALLBACK) {
    Logger.error(
      'Production: JWT_SECRET is missing or still the dev default. Invoice PDF (INVOICE_SHARE) verification will not match any token signed with another key; set JWT_SECRET in Render to one stable value (min ~32 random chars) and keep it across redeploys.',
      'Bootstrap',
    );
  } else if (s.length < 32) {
    Logger.warn(
      'Production: JWT_SECRET is under 32 characters. Prefer a long random value so keys are not easily brute-forced.',
      'Bootstrap',
    );
  }
}
