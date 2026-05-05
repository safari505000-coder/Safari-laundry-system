import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSystemConfigDto {
  @ApiPropertyOptional({
    nullable: true,
    description:
      'WhatsApp alert recipient for System Guardian alerts. Accepted formats: `965XXXXXXXX`, `+965XXXXXXXX`, or local `5/6/9XXXXXXX`. Send `null` or an empty string to clear and fall back to the env variable.',
    example: '96591234567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  guardianPhone?: string | null;
}

export class GuardianPhoneResolvedDto {
  @ApiPropertyOptional({ nullable: true, example: '96591234567' })
  phone!: string | null;

  @ApiProperty({
    enum: ['database', 'env', 'none'],
    description:
      'Where the active phone came from. `database` = configured by the Owner from the UI, `env` = legacy env fallback, `none` = no recipient configured (Guardian will skip WhatsApp delivery).',
  })
  source!: 'database' | 'env' | 'none';
}

export class SystemConfigResponseDto {
  @ApiPropertyOptional({
    nullable: true,
    description:
      'The phone number persisted in the SystemConfig table. `null` when the Owner has not configured a value (the env fallback may still apply — see `resolved`).',
  })
  guardianPhone!: string | null;

  @ApiProperty({
    type: GuardianPhoneResolvedDto,
    description:
      'The phone the System Guardian will actually use right now after applying the DB → env → none fallback chain.',
  })
  resolved!: GuardianPhoneResolvedDto;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ISO timestamp of the last UI save, or null when never set.',
  })
  updatedAt!: string | null;
}
