import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CustomerRefreshTokenRequestDto {
  @ApiProperty({
    description:
      'Opaque customer refresh token returned by customer OTP verification. Single-use and rotated on redemption.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(32, 256)
  refreshToken: string;
}

export class CustomerRefreshTokenResponseDto {
  @ApiProperty({
    description:
      'Customer portal access JWT. Use Authorization: Bearer <token>.',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Fresh customer refresh token. Store it and discard the redeemed token.',
  })
  refreshToken: string;
}
