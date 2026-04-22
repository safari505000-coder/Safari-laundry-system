import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class RefreshTokenRequestDto {
  @ApiProperty({
    description:
      'Opaque refresh token returned by POST /api/auth/login. Single-use — redeeming it issues a new refresh token and revokes this one.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(32, 256)
  refreshToken: string;
}

export class RefreshTokenResponseDto {
  @ApiProperty({
    description:
      'Short-lived bearer token (default 15 min). Use Authorization: Bearer <token>.',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Fresh refresh token — store this and discard the one you just exchanged.',
  })
  refreshToken: string;
}
