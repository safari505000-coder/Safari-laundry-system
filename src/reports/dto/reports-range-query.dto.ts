import { PosPaymentMethod } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class ReportsRangeQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsEnum(PosPaymentMethod)
  @Transform(({ value }) =>
    value === '' || value === undefined ? undefined : value,
  )
  posPaymentMethod?: PosPaymentMethod;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
