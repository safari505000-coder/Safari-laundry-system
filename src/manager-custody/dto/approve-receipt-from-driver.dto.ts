import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Dastur §3 — Manager approves receipt of cash from Driver.
 * Creates a ManagerCashCustody row in PENDING_DEPOSIT; driver orders become
 * HANDED_OVER_TO_OFFICE; open shift is closed. Slip is NOT required here —
 * the 24h aging clock starts now and the manager uploads the bank slip later.
 */
export class ApproveReceiptFromDriverDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  driverId: string;

  @ApiPropertyOptional({
    description:
      'Physical cash counted by the manager; if provided must match ledger within 0.0001 KWD.',
    example: 450.25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  declaredHandoverTotal?: number;

  @ApiPropertyOptional({ description: 'Free-text note (audit)', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
