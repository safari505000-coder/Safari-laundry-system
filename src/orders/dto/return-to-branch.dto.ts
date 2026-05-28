import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryReturnReason } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReturnToBranchDto {
  @ApiProperty({
    enum: DeliveryReturnReason,
    enumName: 'DeliveryReturnReason',
    example: DeliveryReturnReason.NO_ANSWER,
  })
  @IsEnum(DeliveryReturnReason)
  reason!: DeliveryReturnReason;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
