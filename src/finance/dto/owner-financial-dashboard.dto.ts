import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type FinancialAlertType =
  | 'HIGH_DEBT'
  | 'DRIVER_DELAY'
  | 'EXPENSE_SPIKE'
  | 'CASH_MISMATCH';

export type FinancialAlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type DriverRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'WARNING';

export type CustomerHealth = 'GOOD' | 'WATCH' | 'RISK' | 'BLOCKED';

export class FinancialAlertDto {
  @ApiProperty({ enum: ['HIGH_DEBT', 'DRIVER_DELAY', 'EXPENSE_SPIKE', 'CASH_MISMATCH'] })
  type!: FinancialAlertType;

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'] })
  severity!: FinancialAlertSeverity;

  @ApiProperty()
  entityId!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  createdAt!: string;
}

export class OwnerTopCustomerDto {
  @ApiProperty()
  customerId!: string;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiProperty()
  totalDueKd!: string;

  @ApiProperty()
  totalInvoicesKd!: string;

  @ApiProperty()
  totalPaymentsKd!: string;

  @ApiProperty({ enum: ['GOOD', 'WATCH', 'RISK', 'BLOCKED'] })
  customerHealth!: CustomerHealth;

  @ApiProperty()
  paymentConsistency!: number;

  @ApiProperty()
  avgPaymentDelayHours!: number;

  @ApiProperty()
  lifetimeValueKd!: string;
}

export class RiskyDriverDto {
  @ApiProperty()
  driverId!: string;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiProperty()
  collectedCash!: string;

  @ApiProperty()
  handedCash!: string;

  @ApiProperty()
  delayHours!: number;

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH', 'WARNING'] })
  riskLevel!: DriverRiskLevel;
}

export class OwnerFinancialDashboardDto {
  @ApiProperty()
  generatedAt!: string;

  @ApiProperty()
  totalInvoicesToday!: string;

  @ApiProperty()
  totalPaymentsToday!: string;

  @ApiProperty()
  totalDueTotal!: string;

  @ApiProperty()
  cashInDrivers!: string;

  @ApiProperty()
  cashInOffice!: string;

  @ApiProperty()
  reconciliationDifference!: string;

  @ApiProperty({ type: [FinancialAlertDto] })
  alerts!: FinancialAlertDto[];

  @ApiProperty({ type: [OwnerTopCustomerDto] })
  topCustomers!: OwnerTopCustomerDto[];

  @ApiProperty({ type: [RiskyDriverDto] })
  riskyDrivers!: RiskyDriverDto[];
}
