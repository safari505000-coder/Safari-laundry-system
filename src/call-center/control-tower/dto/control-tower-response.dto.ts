import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ControlTowerPreset } from './control-tower-query.dto';

/** Operational SLA tier for an open dispatch (derived read-model). */
export type ControlTowerSlaStatusDto = 'OK' | 'LATE' | 'ESCALATED' | 'BREACHED';

/** Manual collection classification (`CustomerCollectionStatus.status`). */
export type ControlTowerRiskLevelDto = 'NORMAL' | 'LATE' | 'RISK';

export class ControlTowerKpisDto {
  @ApiProperty({ description: 'Σ unpaid invoice totals (KWD).' })
  totalDue!: number;

  @ApiProperty({
    description: 'Distinct customers with ≥1 qualifying unpaid invoice.',
  })
  customersWithDebt!: number;

  @ApiProperty({
    description:
      'Customers classified late for KPIs: collection `LATE` OR invoice-derived daysLate ≥ 3.',
  })
  lateCustomers!: number;

  @ApiProperty({
    description: 'Customers with collection status `RISK`.',
  })
  riskCustomers!: number;

  @ApiProperty({
    description:
      'System-wide open dispatches (`ASSIGNED` or `IN_PROGRESS`) — operational visibility.',
  })
  activeDispatches!: number;

  @ApiProperty({
    description:
      'Subset of active dispatches whose computed SLA tier is `BREACHED`.',
  })
  slaBreached!: number;
}

/** Dispatch-focused workload — IDs are UUID strings. */
export class ControlTowerDriverWorkloadDto {
  @ApiProperty({ description: 'Driver user UUID.' })
  driverId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Open dispatches in ASSIGNED.' })
  assigned!: number;

  @ApiProperty({ description: 'Open dispatches in IN_PROGRESS.' })
  inProgress!: number;

  @ApiProperty({
    description:
      'Open dispatches where SLA ∉ { OK } (LATE, ESCALATED, or BREACHED).',
  })
  late!: number;
}

/** One consolidated AR + dispatch intelligence row per customer. */
export class ControlTowerRowDto {
  @ApiProperty({ description: 'Customer UUID.' })
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty({ description: 'Display driver name for context row.' })
  driverName!: string;

  @ApiProperty({ description: 'Σ unpaid qualifying invoices (KWD).' })
  totalDue!: number;

  @ApiProperty()
  invoicesCount!: number;

  @ApiProperty({
    description:
      'Whole days late from earliest invoice dueDate else earliest createdAt anchor.',
  })
  daysLate!: number;

  @ApiProperty({ enum: ['NORMAL', 'LATE', 'RISK'] })
  riskLevel!: ControlTowerRiskLevelDto;

  @ApiProperty({
    description: 'Whether customer has an ASSIGNED or IN_PROGRESS dispatch.',
  })
  hasActiveDispatch!: boolean;

  @ApiProperty({
    nullable: true,
    enum: ['ASSIGNED', 'IN_PROGRESS'],
    description: 'Active dispatch status when present.',
  })
  dispatchStatus!: 'ASSIGNED' | 'IN_PROGRESS' | null;

  @ApiProperty({ enum: ['OK', 'LATE', 'ESCALATED', 'BREACHED'] })
  slaStatus!: ControlTowerSlaStatusDto;

  @ApiProperty({
    description:
      'Manual AR block toggle (`CustomerCollectionStatus.blocked`) — never auto-set.',
  })
  blocked!: boolean;
}

export class ControlTowerMetaDto {
  @ApiProperty({ enum: ControlTowerPreset })
  preset!: ControlTowerPreset;

  @ApiProperty({ description: 'ISO projection timestamp.' })
  generatedAt!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Resolved lower bound on `Order.createdAt` filter.',
  })
  windowFromIso!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Resolved upper bound on `Order.createdAt` filter.',
  })
  windowToIso!: string | null;
}

export class ControlTowerResponseDto {
  @ApiProperty({ type: ControlTowerKpisDto })
  kpis!: ControlTowerKpisDto;

  @ApiProperty({ type: [ControlTowerDriverWorkloadDto] })
  drivers!: ControlTowerDriverWorkloadDto[];

  @ApiProperty({ type: [ControlTowerRowDto] })
  rows!: ControlTowerRowDto[];

  @ApiProperty({ type: ControlTowerMetaDto })
  meta!: ControlTowerMetaDto;
}
