import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** Matches {@link passwordMinLength} at runtime via {@link assertPasswordStrength}. */
export class ResetPasswordBodyDto {
  @ApiProperty({
    description:
      'New temporary password — user must change it at next login (`mustChangePassword`).',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
