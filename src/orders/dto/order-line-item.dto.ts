import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StarchOption } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
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

  @ApiPropertyOptional({
    enum: StarchOption,
    enumName: 'StarchOption',
    description: 'Optional starch option; STARCH_25 means 25% starch (نشا 25%).',
  })
  @IsOptional()
  @IsEnum(StarchOption)
  starchOption?: StarchOption;

  @ApiProperty({ example: 45.25 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  unitPrice: number;
}
