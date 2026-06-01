import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Minimal, dependency-free TOTP (RFC 6238) + base32 helpers.
 *
 * Used by the V10 account-security module for MFA. Kept pure and free of any
 * NestJS / Prisma imports so it is trivially unit-testable.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode raw bytes to RFC 4648 base32 (no padding), as used by authenticators. */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** Decode an RFC 4648 base32 string (case-insensitive, padding tolerated). */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error('Invalid base32 character');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a new base32 TOTP secret (default 20 random bytes = 160 bits). */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

function hotp(secret: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter (high word is 0 for realistic time windows).
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export interface TotpOptions {
  step?: number; // seconds per code (default 30)
  digits?: number; // code length (default 6)
}

/** Compute the current TOTP code for a base32 secret. */
export function generateTotp(
  secretBase32: string,
  atMs: number = Date.now(),
  opts: TotpOptions = {},
): string {
  const step = opts.step ?? 30;
  const digits = opts.digits ?? 6;
  const counter = Math.floor(atMs / 1000 / step);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/**
 * Verify a candidate code against a secret, allowing +/- `window` steps of
 * clock drift (default +/-1 = ~90s tolerance). Constant-time per candidate.
 */
export function verifyTotp(
  secretBase32: string,
  candidate: string,
  atMs: number = Date.now(),
  opts: TotpOptions & { window?: number } = {},
): boolean {
  const step = opts.step ?? 30;
  const digits = opts.digits ?? 6;
  const window = opts.window ?? 1;
  const normalized = (candidate ?? '').replace(/\s+/g, '');
  if (!/^\d+$/.test(normalized) || normalized.length !== digits) {
    return false;
  }
  const secret = base32Decode(secretBase32);
  const base = Math.floor(atMs / 1000 / step);
  for (let errorWindow = -window; errorWindow <= window; errorWindow += 1) {
    const expected = hotp(secret, base + errorWindow, digits);
    const a = Buffer.from(expected);
    const b = Buffer.from(normalized);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

/** Build the otpauth:// URI an authenticator app scans (label + issuer). */
export function buildOtpAuthUri(params: {
  secretBase32: string;
  accountName: string;
  issuer?: string;
  digits?: number;
  step?: number;
}): string {
  const issuer = params.issuer ?? 'Safari ERP';
  const label = encodeURIComponent(`${issuer}:${params.accountName}`);
  const query = new URLSearchParams({
    secret: params.secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(params.digits ?? 6),
    period: String(params.step ?? 30),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/** Generate N human-friendly recovery codes (plaintext, shown once). */
export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = randomBytes(5).toString('hex').toUpperCase(); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

/** Hash a recovery code for at-rest storage (never store plaintext). */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256')
    .update(code.replace(/[\s-]/g, '').toUpperCase())
    .digest('hex');
}
