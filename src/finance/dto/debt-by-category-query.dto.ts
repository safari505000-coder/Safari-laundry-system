import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DebtEntityCategory } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class DebtByCategoryQueryDto {
  @ApiProperty({ example: '2026-04-15T00:00:00.000Z' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2026-04-15T23:59:59.999Z' })
  @IsDateString()
  to: string;

  @ApiPropertyOptional({ enum: DebtEntityCategory })
  @IsOptional()
  @IsEnum(DebtEntityCategory)
  category?: DebtEntityCategory;

  @ApiPropertyOptional({ description: 'Filter by branch UUID' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by actor user UUID' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;
}
