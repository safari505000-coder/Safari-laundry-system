import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type OwnerDashboardStatus = 'healthy' | 'warning' | 'critical';
export type OwnerDashboardCacheStatus = 'loading' | 'ready' | 'stale';

export class OwnerDashboardPaymentsDto {
  @ApiProperty({ example: 99.2 })
  successRate!: number;

  @ApiProperty({ example: 124 })
  successCount!: number;

  @ApiProperty({ example: 1 })
  failureCount!: number;
}

export class OwnerDashboardOrdersDto {
  @ApiProperty({ example: 58 })
  today!: number;

  @ApiProperty({ example: 17 })
  active!: number;
}

export class OwnerDashboardQueuesDto {
  @ApiProperty({ example: 3 })
  waiting!: number;

  @ApiProperty({ example: 0 })
  failed!: number;
}

export class OwnerDashboardAlertsDto {
  @ApiProperty({ example: 0 })
  active!: number;

  @ApiPropertyOptional({ example: 'All systems are operating normally.' })
  lastMessage?: string;
}

export class OwnerDashboardResponseDto {
  @ApiProperty({ enum: ['healthy', 'warning', 'critical'], example: 'healthy' })
  systemStatus!: OwnerDashboardStatus;

  @ApiProperty({ example: 1240.5 })
  revenueToday!: number;

  @ApiProperty({ example: 28150.75 })
  revenueThisMonth!: number;

  @ApiProperty({ type: OwnerDashboardPaymentsDto })
  payments!: OwnerDashboardPaymentsDto;

  @ApiProperty({ type: OwnerDashboardOrdersDto })
  orders!: OwnerDashboardOrdersDto;

  @ApiProperty({ type: OwnerDashboardQueuesDto })
  queues!: OwnerDashboardQueuesDto;

  @ApiProperty({ type: OwnerDashboardAlertsDto })
  alerts!: OwnerDashboardAlertsDto;
}

export class OwnerDashboardCacheResponseDto {
  @ApiProperty({ enum: ['loading', 'ready', 'stale'], example: 'ready' })
  status!: OwnerDashboardCacheStatus;

  @ApiProperty({ type: OwnerDashboardResponseDto, nullable: true })
  data!: OwnerDashboardResponseDto | null;

  @ApiProperty({ example: '2026-05-01T17:20:00.000Z', nullable: true })
  lastUpdated!: string | null;
}
