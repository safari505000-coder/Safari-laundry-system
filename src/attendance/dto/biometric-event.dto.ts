import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Stub payload for biometric (fingerprint / face-scan) devices.
 *
 * The concrete vendor integration is deferred (DUSTUR §6, HR-BIO-001).
 * This DTO + the POST /api/attendance/biometric endpoint establish the
 * contract today so the actual device driver can post events without
 * further schema changes. Accepts either a native civilId OR the
 * device's own user mapping string (`externalUserRef`).
 */
export type BiometricAction = 'CHECK_IN' | 'CHECK_OUT';

export class BiometricEventDto {
  @ApiPropertyOptional({
    description:
      'Kuwaiti Civil ID of the employee the device recognised (preferred).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  civilId?: string;

  @ApiPropertyOptional({
    description:
      'Alternative: the device-local user id if the device does not map to civilId.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalUserRef?: string;

  @ApiProperty({ enum: ['CHECK_IN', 'CHECK_OUT'] })
  @IsString()
  @IsIn(['CHECK_IN', 'CHECK_OUT'])
  action!: BiometricAction;

  @ApiProperty({ description: 'Device-supplied UTC timestamp of the event.' })
  @IsISO8601()
  atIso!: string;

  @ApiProperty({ description: 'Device fingerprint / serial for audit.' })
  @IsString()
  @MaxLength(128)
  deviceId!: string;

  @ApiPropertyOptional({
    description: 'Optional confidence score or device note.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  meta?: string;
}
