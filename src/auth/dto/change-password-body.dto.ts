import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * جسم تغيير كلمة المرور — كلمة المرور الحالية والجديدة (6 أحرف كحد أدنى).
 * Change-password request body — current password and new password (minimum 6 characters).
 */
export class ChangePasswordBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  oldPassword!: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
