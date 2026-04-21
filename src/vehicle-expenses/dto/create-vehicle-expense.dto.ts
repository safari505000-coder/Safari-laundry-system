import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleExpenseType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * V19.10 — FLEET_SUPERVISOR submits a vehicle expense. The receipt is
 * MANDATORY: there is no "optional" path for a fleet expense — every
 * row going to the accountant must be backed by a photo. The receipt
 * is transmitted as a data URL (image/jpeg or image/png) so the same
 * 1mb express.json ceiling we set for fuel receipts applies here.
 */
export class CreateVehicleExpenseDto {
  @ApiProperty({ example: '12345', maxLength: 32 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  vehiclePlate!: string;

  @ApiPropertyOptional({
    example: 'Toyota Hiace 2022 — White',
    maxLength: 120,
    description: 'Optional display label for the vehicle.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleLabel?: string;

  @ApiProperty({ enum: VehicleExpenseType, example: VehicleExpenseType.FUEL })
  @IsEnum(VehicleExpenseType)
  expenseType!: VehicleExpenseType;

  @ApiProperty({ example: 12.5, minimum: 0.0001 })
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @ApiPropertyOptional({ example: 152_340, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @ApiPropertyOptional({ example: 'Al-Rihani Auto Repair', maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendorName?: string;

  @ApiPropertyOptional({ example: 'Front brake pads replacement', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '2026-04-19T10:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  expenseDate?: string;

  /**
   * Required data URL for the receipt image. Keep < ~400kb so it fits
   * comfortably under the 1mb JSON body limit with headroom for the
   * rest of the payload.
   */
  @ApiProperty({
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...',
    description:
      'Mandatory receipt photo as a data URL (image/jpeg or image/png).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(900_000)
  receiptUrl!: string;
}
