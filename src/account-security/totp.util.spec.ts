import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  generateRecoveryCodes,
  generateTotp,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotp,
} from './totp.util';

// RFC 6238 SHA-1 reference secret "12345678901234567890" (ASCII) in base32.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('totp.util', () => {
  describe('base32', () => {
    it('round-trips arbitrary bytes', () => {
      const data = Buffer.from([0, 1, 2, 250, 255, 128, 64, 32]);
      expect(base32Decode(base32Encode(data)).equals(data)).toBe(true);
    });

    it('decodes case-insensitively and tolerates padding/spaces', () => {
      const enc = base32Encode(Buffer.from('hello'));
      expect(base32Decode(enc.toLowerCase()).toString()).toBe('hello');
    });
  });

  describe('generateTotp (RFC 6238 vectors)', () => {
    it('matches the published 8-digit SHA-1 codes', () => {
      expect(generateTotp(RFC_SECRET, 59_000, { digits: 8, step: 30 })).toBe('94287082');
      expect(generateTotp(RFC_SECRET, 1_111_111_109_000, { digits: 8, step: 30 })).toBe(
        '07081804',
      );
      expect(generateTotp(RFC_SECRET, 1_234_567_890_000, { digits: 8, step: 30 })).toBe(
        '89005924',
      );
    });
  });

  describe('verifyTotp', () => {
    it('accepts the current code', () => {
      const secret = generateTotpSecret();
      const now = Date.now();
      expect(verifyTotp(secret, generateTotp(secret, now), now)).toBe(true);
    });

    it('accepts a code within the drift window', () => {
      const secret = generateTotpSecret();
      const now = Date.now();
      const previous = generateTotp(secret, now - 30_000);
      expect(verifyTotp(secret, previous, now, { window: 1 })).toBe(true);
    });

    it('rejects codes outside the window', () => {
      const secret = generateTotpSecret();
      const now = Date.now();
      const stale = generateTotp(secret, now - 120_000);
      expect(verifyTotp(secret, stale, now, { window: 1 })).toBe(false);
    });

    it('rejects malformed input', () => {
      const secret = generateTotpSecret();
      expect(verifyTotp(secret, 'abc', Date.now())).toBe(false);
      expect(verifyTotp(secret, '', Date.now())).toBe(false);
      expect(verifyTotp(secret, '1234567', Date.now())).toBe(false);
    });
  });

  describe('recovery codes', () => {
    it('generates the requested count of unique codes', () => {
      const codes = generateRecoveryCodes(8);
      expect(codes).toHaveLength(8);
      expect(new Set(codes).size).toBe(8);
    });

    it('hashes deterministically and ignores formatting', () => {
      const code = 'ABCDE-12345';
      expect(hashRecoveryCode(code)).toBe(hashRecoveryCode('abcde12345'));
      expect(hashRecoveryCode(code)).toHaveLength(64);
    });
  });

  describe('buildOtpAuthUri', () => {
    it('produces a scannable otpauth URI', () => {
      const uri = buildOtpAuthUri({ secretBase32: RFC_SECRET, accountName: 'owner' });
      expect(uri).toContain('otpauth://totp/');
      expect(uri).toContain(`secret=${RFC_SECRET}`);
      expect(uri).toContain('issuer=Safari');
    });
  });
});
