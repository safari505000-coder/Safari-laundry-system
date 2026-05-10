/**
 * Plain-password validation — MUST stay server-side only (never log secrets).
 */
import { BadRequestException } from '@nestjs/common';

const DEFAULT_MIN = 6;

function passwordMinLength(): number {
  const raw = process.env.PASSWORD_MIN_LENGTH ?? '';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 4 ? n : DEFAULT_MIN;
}

export function assertPasswordStrength(plain: string): void {
  const min = passwordMinLength();
  if (typeof plain !== 'string' || plain.length < min) {
    throw new BadRequestException(
      `Password must be at least ${min} characters.`,
    );
  }
}
