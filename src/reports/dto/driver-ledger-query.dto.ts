import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

/**
 * استعلام دفتر السائق — معرّف السائق ونطاق تاريخي وفلتر فرع اختياري.
 * Driver-ledger query DTO — driver ID, date range, and optional branch filter.
 */
export class DriverLedgerQueryDto {
  @IsUUID()
  driverId!: string;

  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
