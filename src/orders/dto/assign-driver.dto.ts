import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignDriverDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Employee user id; must be a DRIVER role',
  })
  @IsUUID('4')
  driverId: string;
}
