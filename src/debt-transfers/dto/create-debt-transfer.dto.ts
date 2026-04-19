import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateDebtTransferDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Departing driver (owner of the outstanding PAID_TO_DRIVER orders).',
  })
  @IsUUID()
  sourceDriverId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Replacement driver accepting the debt.',
  })
  @IsUUID()
  targetDriverId!: string;

  @ApiProperty({
    type: [String],
    description: 'Orders (UUIDs) whose cash responsibility is transferred.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  orderIds!: string[];

  @ApiPropertyOptional({ description: 'Short reason (e.g. "driver travelling").' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ description: 'Free-form notes printed on the receipt.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
