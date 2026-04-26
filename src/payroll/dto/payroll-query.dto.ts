import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

/** Query strings often send `branchId=`; `@IsOptional` only skips `undefined`/`null`, not `""`. */
function emptyToUndefinedUuid(value: unknown): unknown {
  if (value === '' || value === undefined || value === null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return typeof value === 'string' ? value.trim() : value;
}

export class PayrollQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefinedUuid(value))
  @IsUUID()
  branchId?: string;
}
