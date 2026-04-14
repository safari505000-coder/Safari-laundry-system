import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class OrderLineItemDto {
  @ApiPropertyOptional({ example: 'Express crate — Zone A' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 45.25 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  unitPrice: number;
}
