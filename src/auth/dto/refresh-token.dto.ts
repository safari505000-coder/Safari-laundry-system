import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

/**
 * طلب تجديد التوكن — الرمز المميز المعتم (single-use) للحصول على access token جديد.
 * Refresh-token request DTO — opaque single-use refresh token to exchange for a new access token.
 */
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

/**
 * استجابة تجديد التوكن — access token جديد ورمز تحديث دوار.
 * Refresh-token response DTO — fresh short-lived access token and a rotated refresh token.
 */
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
