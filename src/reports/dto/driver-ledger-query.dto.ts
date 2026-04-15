import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

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
