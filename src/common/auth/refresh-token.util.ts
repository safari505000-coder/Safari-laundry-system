import * as crypto from 'node:crypto';

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function generateRefreshTokenRaw(): string {
  // 48 random bytes -> 64-char base64url; gives ~384 bits of entropy.
  return crypto.randomBytes(48).toString('base64url');
}
