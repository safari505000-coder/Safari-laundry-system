/**
 * V19.27.3 — Single source for the dev-only JWT HMAC default.
 * Must match `AuthModule` / `JwtModule.register({ secret: … })` fallback; used at
 * bootstrap to warn in production. INVOICE_SHARE + PDF public links use the same
 * `JwtService` and therefore the same `JWT_SECRET` as login tokens.
 */
export const JWT_SECRET_DEV_FALLBACK =
  'safari-dev-jwt-secret-change-in-production';

/**
 * Fail-closed JWT secret resolver. In production a missing secret — or one left
 * at the dev default — aborts boot so the app can never sign/verify tokens with
 * a publicly known key. In non-production environments the dev fallback is
 * allowed so local/test runs work without extra config.
 */
export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret && secret !== JWT_SECRET_DEV_FALLBACK) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: JWT_SECRET is missing or still set to the dev default in production. ' +
        'Set a stable random JWT_SECRET (>= 32 chars) on the host and redeploy.',
    );
  }
  return secret || JWT_SECRET_DEV_FALLBACK;
}
