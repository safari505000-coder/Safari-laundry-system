import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class PermissionKeyDto {
  @ApiProperty({
    example: 'wallet:read',
    description: 'Permission key (resource:action)',
  })
  @IsString()
  @MinLength(2)
  @Matches(/^[a-z][a-z0-9]*:[a-z][a-z0-9]*$/i, {
    message: 'permissionKey must look like "resource:action"',
  })
  permissionKey: string;
}
