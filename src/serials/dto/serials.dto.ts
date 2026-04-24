import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { SafariRole } from '@prisma/client';

export class SetDriverPrefixDto {
  /**
   * Single English capital letter ("A"..."Z"). Nullable (pass an empty
   * string or omit to clear). Stored as-is; uniqueness is enforced by
   * the DB-level unique constraint.
   */
  @IsOptional()
  @IsString()
  @Length(1, 1)
  @Matches(/^[A-Z]$/, {
    message: 'driverPrefix must be a single uppercase letter A-Z',
  })
  driverPrefix?: string | null;
}

/**
 * V19.23 — Serial management expanded from DRIVER-only to include
 * MANAGER. Branch managers can create invoices from the POS while
 * covering their branch, so each manager also needs their own
 * unique single-letter prefix to keep `<prefix>-<counter>` unique
 * across every ticket-issuing user. The field in Prisma is still
 * called `driverPrefix` for backwards compatibility — semantically
 * it now means "operator prefix".
 */
export class DriverPrefixRowDto {
  id!: string;
  fullName!: string;
  username!: string;
  driverPrefix!: string | null;
  branchName!: string | null;
  isActive!: boolean;
  /** V19.23 — so the UI can group/distinguish DRIVER vs MANAGER rows. */
  safariRole!: Extract<SafariRole, 'DRIVER' | 'MANAGER'>;
}

export class SerialLogRowDto {
  orderId!: string;
  serialNumber!: string;
  driverId!: string | null;
  driverName!: string | null;
  driverPrefix!: string | null;
  customerName!: string | null;
  totalPriceKd!: string;
  createdAtIso!: string;
}

export class SerialLogDto {
  /** V19.24 — number of `Order` rows with a non-null `serialNumber` (badge in Owner log). */
  currentCounter!: number;
  rows!: SerialLogRowDto[];
}
