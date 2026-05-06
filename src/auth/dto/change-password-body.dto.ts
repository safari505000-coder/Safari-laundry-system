import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

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
