/**
 * SystemConfigService — operational-only platform config (single row).
 *
 * Stores non-financial settings that the Owner can edit from the
 * Settings UI. Today the only attribute is `guardianPhone` — the
 * WhatsApp recipient for System Guardian alerts — but the table is
 * the canonical home for any future ops-only knob (alert webhook,
 * default branch, etc.).
 *
 * STRICT contract:
 *   - NO financial fields, NO classifier inputs, NO money math.
 *   - Single row keyed at `id = "GLOBAL"`. We seed it via the
 *     migration so reads never see a missing row.
 *   - Phone numbers are normalised to the canonical Kuwait format
 *     (`965XXXXXXXX`) via the existing `parseKuwaitMobile965` helper
 *     before persistence — one canonical definition platform-wide.
 *   - Resolving the alert phone follows the spec's fallback order:
 *       1) DB value (admin-configured from the UI)
 *       2) `SYSTEM_GUARDIAN_OWNER_PHONE` env (legacy fallback)
 *       3) `null`  → caller MUST skip the WhatsApp send safely.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseKuwaitMobile965 } from '../common/validation/kuwait-customer-phone';

/**
 * Stable id for the canonical singleton row. Migration seeds this id;
 * the service only ever upserts on the same key.
 */
const SYSTEM_CONFIG_ID = 'GLOBAL';

export type GuardianPhoneSource = 'database' | 'env' | 'none';

export type ResolvedGuardianPhone = {
  /** Normalised Kuwait digits (`965XXXXXXXX`) or null when unresolved. */
  phone: string | null;
  /** Where the value came from. `'none'` means caller must skip send. */
  source: GuardianPhoneSource;
};

@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read the configured guardian phone from the DB. Returns `null`
   * when the field is unset OR when the stored value somehow fails
   * the canonical Kuwait check (defensive — should not happen since
   * `setGuardianPhone` validates before write).
   */
  async getGuardianPhone(): Promise<string | null> {
    const row = await this.prisma.systemConfig.findUnique({
      where: { id: SYSTEM_CONFIG_ID },
      select: { guardianPhone: true },
    });
    const raw = row?.guardianPhone ?? null;
    if (!raw) return null;
    const normalised = parseKuwaitMobile965(raw);
    if (!normalised) {
      this.logger.warn(
        `system_config_invalid_phone: stored value rejected by validator (${maskForLog(raw)})`,
      );
      return null;
    }
    return normalised;
  }

  /**
   * Resolve the WhatsApp recipient for the System Guardian using the
   * documented fallback chain (DB → env → none).
   *
   * Read-only: never writes the env value back into the DB. The env
   * fallback exists for legacy installs that haven't migrated their
   * config to the UI yet.
   */
  async resolveGuardianPhone(): Promise<ResolvedGuardianPhone> {
    const fromDb = await this.getGuardianPhone();
    if (fromDb) return { phone: fromDb, source: 'database' };

    const envRaw = process.env.SYSTEM_GUARDIAN_OWNER_PHONE?.trim();
    const envDigits = envRaw ? parseKuwaitMobile965(envRaw) : null;
    if (envDigits) return { phone: envDigits, source: 'env' };

    return { phone: null, source: 'none' };
  }

  /**
   * Public read surface for the controller — returns the saved value
   * AND the resolved value (which may differ if the DB is empty and
   * the env fallback kicks in). The UI can use `effective` to render
   * what the Guardian will actually use right now.
   */
  async getPublicConfig(): Promise<{
    guardianPhone: string | null;
    resolved: ResolvedGuardianPhone;
    updatedAt: string | null;
  }> {
    const row = await this.prisma.systemConfig.findUnique({
      where: { id: SYSTEM_CONFIG_ID },
      select: { guardianPhone: true, updatedAt: true },
    });
    const stored = row?.guardianPhone
      ? (parseKuwaitMobile965(row.guardianPhone) ?? row.guardianPhone)
      : null;
    const resolved = await this.resolveGuardianPhone();
    return {
      guardianPhone: stored,
      resolved,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  /**
   * Persist a new alert phone. Pass `null` (or an empty string) to
   * clear the value — useful when the operator wants to fall back to
   * the env or fully disable WhatsApp delivery.
   *
   * @throws BadRequestException when the input is non-empty and does
   *   not normalise to a valid Kuwait mobile.
   */
  async setGuardianPhone(input: string | null): Promise<{
    guardianPhone: string | null;
    updatedAt: string;
  }> {
    let normalised: string | null = null;
    if (input !== null && input !== undefined) {
      const trimmed = String(input).trim();
      if (trimmed.length > 0) {
        const parsed = parseKuwaitMobile965(trimmed);
        if (!parsed) {
          throw new BadRequestException(
            'guardianPhone must be a valid Kuwait mobile (965 + 8 digits starting with 5/6/9, e.g. 96591234567).',
          );
        }
        normalised = parsed;
      }
    }

    const row = await this.prisma.systemConfig.upsert({
      where: { id: SYSTEM_CONFIG_ID },
      create: { id: SYSTEM_CONFIG_ID, guardianPhone: normalised },
      update: { guardianPhone: normalised },
      select: { guardianPhone: true, updatedAt: true },
    });

    return {
      guardianPhone: row.guardianPhone,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/**
 * Defensive log helper — never echoes more than the first 3 digits
 * + last 4 digits of a phone number into application logs.
 */
function maskForLog(s: string): string {
  const compact = s.replace(/\s+/g, '');
  if (compact.length < 6) return '***';
  return `${compact.slice(0, 3)}****${compact.slice(-4)}`;
}
