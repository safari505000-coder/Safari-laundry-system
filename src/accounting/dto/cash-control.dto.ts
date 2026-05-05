import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type CashReconciliationStatus = 'OK' | 'MISMATCH' | 'CRITICAL';
export type CashResponsibleParty = 'DRIVER' | 'BRANCH' | 'ACCOUNTING';
export type CashSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type CashTimelineEventType =
  | 'ORDER_COLLECTED'
  | 'DRIVER_HANDOVER'
  | 'MANAGER_CONFIRMED'
  | 'BANK_DEPOSITED';

export class CashResponsibilityDto {
  @ApiProperty({ enum: ['DRIVER', 'BRANCH', 'ACCOUNTING'] })
  responsible!: CashResponsibleParty;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  delayHours!: number;

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'] })
  severity!: CashSeverity;
}

export class CashDriverBreakdownDto {
  @ApiProperty()
  driverId!: string;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiProperty()
  collected!: string;

  @ApiProperty()
  handed!: string;

  @ApiProperty()
  difference!: string;

  @ApiProperty({ enum: ['OK', 'MISMATCH', 'CRITICAL'] })
  status!: CashReconciliationStatus;
}

export class CashControlAlertDto {
  @ApiProperty()
  type!:
    | 'MISSING_HANDOVER'
    | 'DELAYED_DEPOSIT'
    | 'PARTIAL_DEPOSIT'
    | 'DEPOSIT_NOT_REGISTERED';

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'] })
  severity!: CashSeverity;

  @ApiProperty()
  entityId!: string;

  @ApiProperty()
  message!: string;
}

export class CashFlowControlDto {
  @ApiProperty()
  custodyId!: string;

  @ApiPropertyOptional({ nullable: true })
  shiftId!: string | null;

  @ApiProperty()
  custodyAmount!: string;

  @ApiProperty()
  linkedOrdersTotal!: string;

  @ApiPropertyOptional({ nullable: true })
  depositId!: string | null;

  @ApiProperty({ enum: ['MISSING', 'PENDING', 'VERIFIED', 'AMOUNT_MISMATCH'] })
  depositStatus!: 'MISSING' | 'PENDING' | 'VERIFIED' | 'AMOUNT_MISMATCH';

  @ApiProperty()
  auditComplete!: boolean;

  @ApiProperty({ type: [String] })
  anomalyFlags!: string[];
}

export class CashReconciliationDto {
  @ApiProperty()
  date!: string;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty() expectedCash!: string;
  @ApiProperty() collectedByDrivers!: string;
  @ApiProperty() handedToBranch!: string;
  @ApiProperty() receivedByManager!: string;
  @ApiProperty() depositedToBank!: string;
  @ApiProperty() differenceDriver!: string;
  @ApiProperty() differenceBranch!: string;
  @ApiProperty() differenceBank!: string;
  @ApiProperty() totalDifference!: string;

  @ApiProperty({ enum: ['OK', 'MISMATCH', 'CRITICAL'] })
  status!: CashReconciliationStatus;

  @ApiProperty({ type: [CashDriverBreakdownDto] })
  breakdown!: CashDriverBreakdownDto[];

  @ApiProperty({ type: [CashResponsibilityDto] })
  accountability!: CashResponsibilityDto[];

  @ApiProperty({ type: [CashControlAlertDto] })
  alerts!: CashControlAlertDto[];

  @ApiProperty({ enum: ['MISSING', 'PENDING', 'VERIFIED', 'MIXED'] })
  depositStatus!: 'MISSING' | 'PENDING' | 'VERIFIED' | 'MIXED';

  @ApiProperty()
  auditComplete!: boolean;

  @ApiProperty({ type: [CashFlowControlDto] })
  flows!: CashFlowControlDto[];

  @ApiProperty()
  reconciliationMode!: 'flow_based';

  @ApiProperty()
  ignoredTimingMismatch!: boolean;

  @ApiProperty({ type: [String] })
  actionsTaken!: string[];
}

export class CashTimelineEventDto {
  @ApiProperty({ enum: ['ORDER_COLLECTED', 'DRIVER_HANDOVER', 'MANAGER_CONFIRMED', 'BANK_DEPOSITED'] })
  type!: CashTimelineEventType;

  @ApiProperty()
  timestamp!: string;

  @ApiProperty()
  amount!: string;

  @ApiPropertyOptional({ nullable: true })
  userId!: string | null;

  @ApiProperty()
  sourceId!: string;
}

export class CashTimelineResponseDto {
  @ApiProperty({ type: [CashTimelineEventDto] })
  events!: CashTimelineEventDto[];
}
