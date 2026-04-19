import { ApiPropertyOptional } from '@nestjs/swagger';
import { KnetCommissionRule } from '@prisma/client';
import { IsEnum, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePaymentMethodFeesDto {
  @ApiPropertyOptional({ example: 0.1, description: 'Flat KNET fee in KWD' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  knetFlatKd?: number;

  @ApiPropertyOptional({ example: 0.015, description: 'KNET % of gross (e.g. 0.015 = 1.5%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  knetPercentOfGross?: number;

  @ApiPropertyOptional({ enum: KnetCommissionRule })
  @IsOptional()
  @IsEnum(KnetCommissionRule)
  knetRule?: KnetCommissionRule;

  @ApiPropertyOptional({ example: 0.025, description: 'Card / payment link % (e.g. 0.025 = 2.5%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cardPercentOfGross?: number;
}
