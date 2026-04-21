import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

// V19.0: explicit allow-list so validation does not depend on Prisma client
// regeneration timing on a given deploy target. GENERAL_MANAGER is a
// first-class tier (Owner's strategic proxy) and MUST be accepted.
const SAFARI_ROLE_VALUES: SafariRole[] = [
  'OWNER',
  'GENERAL_MANAGER',
  'MANAGER',
  'DRIVER',
  'WORKER',
  'CALL_CENTER',
  'CALL_CENTER_SUPERVISOR',
  'FLEET_SUPERVISOR',
  'ACCOUNTANT',
  'SUPERVISOR',
  'VIEWER',
];

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
      'OWNER · GENERAL_MANAGER (Owner proxy) · MANAGER · SUPERVISOR: operations · VIEWER · ACCOUNTANT: read-only/finance · DRIVER · CALL_CENTER · CALL_CENTER_SUPERVISOR (full CC + same-day invoice edit/void + team performance reports) · FLEET_SUPERVISOR (vehicle expenses with mandatory receipt → accountant approval)',
  })
  @IsIn(SAFARI_ROLE_VALUES, {
    message: `safariRole must be one of: ${SAFARI_ROLE_VALUES.join(', ')}`,
  })
  safariRole: SafariRole;

  @ApiPropertyOptional({
    example: '+971 4 000 0000',
    description: 'Optional; unique if provided',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ format: 'uuid', description: 'Mandatory branch assignment for all staff.' })
  @IsUUID('4')
  branchId: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Inactive users are blocked from login immediately.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
