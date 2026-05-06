import { ApiProperty } from '@nestjs/swagger';
import { DispatchRowDto } from './dispatch-row.dto';

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
