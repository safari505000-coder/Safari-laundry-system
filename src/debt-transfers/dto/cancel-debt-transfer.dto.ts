import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelDebtTransferDto {
  @ApiPropertyOptional({ description: 'Why the transfer is being voided.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
