import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class MfaCodeDto {
  @ApiProperty({
    description: 'TOTP code from the authenticator app, or a recovery code.',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;
}

export class TrustDeviceDto {
  @ApiProperty({ description: 'Stable client device identifier.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @ApiProperty({ required: false, description: 'Human-friendly device label.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class MfaEnrollResponseDto {
  @ApiProperty({ enum: ['PENDING', 'ACTIVE', 'DISABLED'] })
  status!: string;

  @ApiProperty({ description: 'Base32 TOTP secret (show once during setup).' })
  secret!: string;

  @ApiProperty({ description: 'otpauth:// URI for QR enrollment.' })
  otpauthUri!: string;
}

export class MfaStatusResponseDto {
  @ApiProperty({ enum: ['NONE', 'PENDING', 'ACTIVE', 'DISABLED'] })
  status!: string;

  @ApiProperty({ required: false, nullable: true })
  activatedAt!: string | null;

  @ApiProperty({ description: 'How many unused recovery codes remain.' })
  recoveryCodesRemaining!: number;

  @ApiProperty({ description: 'Whether MFA is required for this role.' })
  required!: boolean;
}

export class MfaActivateResponseDto {
  @ApiProperty({ enum: ['ACTIVE'] })
  status!: string;

  @ApiProperty({
    type: [String],
    description: 'One-time recovery codes — shown once, stored hashed.',
  })
  recoveryCodes!: string[];
}

export class SessionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ required: false, nullable: true })
  deviceId!: string | null;

  @ApiProperty({ required: false, nullable: true })
  ipAddress!: string | null;

  @ApiProperty({ required: false, nullable: true })
  userAgent!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  lastSeenAt!: string;

  @ApiProperty({ required: false, nullable: true })
  expiresAt!: string | null;

  @ApiProperty()
  current!: boolean;
}

export class LoginHistoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['SUCCESS', 'FAILURE', 'MFA_REQUIRED', 'MFA_FAILURE', 'LOCKED'] })
  outcome!: string;

  @ApiProperty({ required: false, nullable: true })
  reason!: string | null;

  @ApiProperty({ required: false, nullable: true })
  ipAddress!: string | null;

  @ApiProperty({ required: false, nullable: true })
  userAgent!: string | null;

  @ApiProperty({ required: false, nullable: true })
  deviceId!: string | null;

  @ApiProperty()
  mfaUsed!: boolean;

  @ApiProperty()
  createdAt!: string;
}

export class DeviceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  deviceId!: string;

  @ApiProperty({ required: false, nullable: true })
  label!: string | null;

  @ApiProperty({ required: false, nullable: true })
  platform!: string | null;

  @ApiProperty({ required: false, nullable: true })
  lastIp!: string | null;

  @ApiProperty()
  trusted!: boolean;

  @ApiProperty()
  firstSeenAt!: string;

  @ApiProperty()
  lastSeenAt!: string;
}
