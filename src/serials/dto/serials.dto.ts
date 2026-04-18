import { IsOptional, IsString, Length, Matches } from 'class-validator';

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

export class DriverPrefixRowDto {
  id!: string;
  fullName!: string;
  username!: string;
  driverPrefix!: string | null;
  branchName!: string | null;
  isActive!: boolean;
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
  currentCounter!: number;
  rows!: SerialLogRowDto[];
}
