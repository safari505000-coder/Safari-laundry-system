import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'Staff username / staff ID' })
  @IsString()
  @MinLength(2)
  @Matches(/^[\w.-]+$/, {
    message:
      'username may contain letters, numbers, dots, dashes, and underscores',
  })
  username: string;

  @ApiProperty({ minLength: 1, example: 'x' })
  @IsString()
  @MinLength(1)
  password: string;
}
