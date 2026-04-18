import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class ConfirmHandoverDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  driverId: string;

  @ApiPropertyOptional({
    description:
      'Optional — slip-first legacy flow. When provided, the custody bag is created directly in AWAITING_VERIFICATION. When omitted, the new Dastur §3 flow creates the bag in PENDING_DEPOSIT and the manager attaches the slip later via POST /api/manager-custody/:id/upload-slip.',
    example: '/uploads/handover-receipts/550e8400-e29b-41d4-a716-446655440000.jpg',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  depositReceiptUrl?: string;

  @ApiPropertyOptional({
    description:
      'Physical cash counted by manager; if provided, must match ledger within 0.0001 KWD',
    example: 450.25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  declaredHandoverTotal?: number;
}
