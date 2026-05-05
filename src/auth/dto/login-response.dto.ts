import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';

export class LoginUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Staff username / staff ID' })
  username: string;

  @ApiProperty({ description: 'Display name' })
  fullName: string;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiProperty({ enum: SafariRole, description: 'Institutional RBAC role' })
  safariRole: SafariRole;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'Branch scope for pricing / operations when applicable',
  })
  branchId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'B2C portal — binds this login to exactly one Customer.id',
  })
  linkedCustomerId?: string | null;
}

export class LoginResponseDto {
  @ApiProperty({
    description:
      'Short-lived bearer token (default 15 min) — use Authorization: Bearer <token> for protected routes (e.g. management reports)',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Opaque refresh token (default 7 days). Send to POST /api/auth/refresh-token to get a fresh access token without re-hashing the password.',
  })
  refreshToken: string;

  @ApiProperty({ type: LoginUserDto })
  user: LoginUserDto;
}
