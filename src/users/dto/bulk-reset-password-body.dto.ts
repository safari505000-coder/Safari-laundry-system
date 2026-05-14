import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString, IsUUID, MinLength } from 'class-validator';

/**
 * إعادة تعيين كلمة المرور بالجملة — قائمة معرّفات المستخدمين وكلمة مرور موحدة لجميعهم.
 * Bulk password-reset body — array of user IDs and a single new password applied to all of them.
 * Each user is flagged to change password on next login.
 */
export class BulkResetPasswordBodyDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Distinct staff user ids — duplicates are de-duplicated server-side.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  userIds!: string[];

  @ApiProperty({
    description:
      'Single password applied to every listed user; each must change at next login.',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
