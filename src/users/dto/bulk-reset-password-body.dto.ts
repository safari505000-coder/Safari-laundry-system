import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString, IsUUID, MinLength } from 'class-validator';

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
