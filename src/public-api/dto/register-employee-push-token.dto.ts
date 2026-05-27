import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterEmployeePushTokenDto {
  @ApiProperty({ description: 'Expo push token from expo-notifications' })
  @IsString()
  @MaxLength(200)
  token!: string;

  @ApiPropertyOptional({ enum: ['ios', 'android'] })
  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: 'ios' | 'android';
}
