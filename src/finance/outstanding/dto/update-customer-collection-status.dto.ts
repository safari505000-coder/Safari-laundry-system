import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerCollectionStatusKind } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * V19.x — PATCH body for `PATCH /api/finance/customer/:id/status`.
 * The single mutation surface for the AR module. `blocked` is the
 * MANUAL block toggle: never written by automation.
 */
export class UpdateCustomerCollectionStatusDto {
  @ApiProperty({ enum: CustomerCollectionStatusKind })
  @IsEnum(CustomerCollectionStatusKind)
  status!: CustomerCollectionStatusKind;

  @ApiProperty({
    description: 'Manual block toggle (no automation writes here).',
  })
  @IsBoolean()
  blocked!: boolean;

  @ApiPropertyOptional({
    description: 'Internal collection note (visible to call-centre only).',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  note?: string;
}

export class CustomerCollectionStatusDto {
  @ApiProperty()
  customerId!: string;

  @ApiProperty({ enum: CustomerCollectionStatusKind })
  status!: CustomerCollectionStatusKind;

  @ApiProperty()
  blocked!: boolean;

  @ApiPropertyOptional()
  note?: string | null;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional()
  updatedById?: string | null;
}
