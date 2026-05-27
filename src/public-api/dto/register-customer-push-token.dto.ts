import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RegisterCustomerPushTokenDto {
  @ApiProperty({ description: 'Customer Kuwait mobile number' })
  @IsString()
  @Matches(/^[569]\d{7}$/)
  customerPhone!: string;

  @ApiProperty({ description: 'Expo push token from expo-notifications' })
  @IsString()
  @MaxLength(200)
  token!: string;

  @ApiPropertyOptional({ enum: ['ios', 'android'] })
  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: 'ios' | 'android';
}
