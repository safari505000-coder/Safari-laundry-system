/**
 * V19.27.3 — Single source for the dev-only JWT HMAC default.
 * Must match `AuthModule` / `JwtModule.register({ secret: … })` fallback; used at
 * bootstrap to warn in production. INVOICE_SHARE + PDF public links use the same
 * `JwtService` and therefore the same `JWT_SECRET` as login tokens.
 */
export const JWT_SECRET_DEV_FALLBACK =
  'safari-dev-jwt-secret-change-in-production';
