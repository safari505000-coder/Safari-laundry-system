import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * تعيين سائق للطلب — يحتوي على معرّف الموظف ذو دور DRIVER.
 * Assign-driver DTO — carries the employee user ID of the driver to assign to an order.
 */
export class AssignDriverDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Employee user id; must be a DRIVER role',
  })
  @IsUUID('4')
  driverId: string;
}
