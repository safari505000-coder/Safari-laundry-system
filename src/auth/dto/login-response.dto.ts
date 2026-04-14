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
}

export class LoginResponseDto {
  @ApiProperty({
    description:
      'Bearer token — use Authorization: Bearer <token> for protected routes (e.g. management reports)',
  })
  accessToken: string;

  @ApiProperty({ type: LoginUserDto })
  user: LoginUserDto;
}
