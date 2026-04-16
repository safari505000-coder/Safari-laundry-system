import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Ahmad Ali', description: 'Full name as shown in the app' })
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiProperty({
    example: 'ahmad.ali',
    description: 'Unique staff username / staff ID used at login',
  })
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

  @ApiProperty({
    enum: SafariRole,
    enumName: 'SafariRole',
    example: SafariRole.DRIVER,
    description:
      'OWNER · MANAGER · SUPERVISOR: operations · VIEWER · ACCOUNTANT: read-only/finance · DRIVER · CALL_CENTER',
  })
  @IsEnum(SafariRole)
  safariRole: SafariRole;

  @ApiPropertyOptional({
    example: '+971 4 000 0000',
    description: 'Optional; unique if provided',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Inactive users are blocked from login immediately.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
