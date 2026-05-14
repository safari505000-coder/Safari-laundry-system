import { PosPaymentMethod } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';

/**
 * استعلام نطاق التقارير — نطاق تاريخي مع فلاتر اختيارية للسائق وطريقة الدفع والفرع.
 * Reports range query DTO — date range with optional driver, payment method, and branch filters.
 */
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
