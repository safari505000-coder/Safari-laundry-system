import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { IsKuwaitCustomerPhone } from '../../common/validation/kuwait-customer-phone';

/** Call Center / CTI — minimal customer row (name + mobile). */
export class CreateCustomerQuickDto {
  @ApiProperty({ example: 'محمد أحمد', maxLength: 200 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName: string;

  @ApiProperty({ example: '51234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value,
  )
  @IsString()
  @MinLength(8)
  @IsKuwaitCustomerPhone()
  phone: string;
}
