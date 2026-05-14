import { ApiProperty } from '@nestjs/swagger';

/**
 * مساهمة سائق واحد — عدد الطلبات المكتملة والإيراد المنسوب إليه.
 * Per-driver contribution row — completed order count and attributed revenue.
 */
export class DriverContributionDto {
  @ApiProperty({ format: 'uuid' })
  driverId: string;

  @ApiProperty({ nullable: true })
  employeeId: string | null;

  @ApiProperty({ description: 'Staff username / staff ID' })
  username: string;

  @ApiProperty({ description: 'Display name' })
  fullName: string;

  @ApiProperty({
    description: 'Count of COMPLETED orders attributed to this driver',
  })
  completedOrderCount: number;

  @ApiProperty({ description: 'Sum of totalPrice for those completed orders' })
  completedRevenue: string;
}

/**
 * لوحة تحكم المدير — نظرة عامة على الطلبات النشطة والإيرادات المكتملة ومساهمات السائقين.
 * Manager dashboard DTO — active order count, completed revenue, and per-driver contributions.
 */
export class ManagerDashboardDto {
  @ApiProperty({
    description:
      'Orders that are not COMPLETED or CANCELED (still in the operational pipeline)',
  })
  totalActiveOrders: number;

  @ApiProperty({
    description: 'Sum of totalPrice for all COMPLETED orders',
    example: '125000.5000',
  })
  revenueCompletedOrders: string;

  @ApiProperty({
    type: [DriverContributionDto],
    description:
      'Completed order volume and revenue by driver (driver-led business contribution)',
  })
  driverContribution: DriverContributionDto[];
}
