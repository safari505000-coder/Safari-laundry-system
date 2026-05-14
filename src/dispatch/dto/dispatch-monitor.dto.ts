import { ApiProperty } from '@nestjs/swagger';
import { DispatchRowDto } from './dispatch-row.dto';

/**
 * لقطة مراقبة السائق — المهام المعيَّنة وأعداد التأخيرات والإخلالات لسائق واحد.
 * Dispatch-monitor driver DTO — assigned tasks, late count, and breach count for a single driver.
 */
export class DispatchMonitorDriverDto {
  @ApiProperty()
  driverId!: string;

  @ApiProperty()
  driverName!: string;

  @ApiProperty({ description: 'ASSIGNED dispatches currently open for this driver.' })
  activeAssignedCount!: number;

  @ApiProperty()
  lateCount!: number;

  @ApiProperty()
  breachCount!: number;

  @ApiProperty({ type: () => [DispatchRowDto] })
  assignedTasks!: DispatchRowDto[];
}

/**
 * لقطة مراقبة التوزيع — تضم بيانات جميع السائقين وشريط التأخير.
 * Dispatch-monitor snapshot DTO — aggregates all driver data and the delayed-drivers strip.
 */
export class DispatchMonitorSnapshotDto {
  @ApiProperty()
  generatedAtIso!: string;

  @ApiProperty({ type: () => [DispatchMonitorDriverDto] })
  drivers!: DispatchMonitorDriverDto[];

  @ApiProperty({
    type: () => [DispatchRowDto],
    description:
      'ASSIGNED dispatches past the first SLA threshold — operations “delayed drivers” strip.',
  })
  delayedDriversSection!: DispatchRowDto[];
}
