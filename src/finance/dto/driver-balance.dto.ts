import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DriverBalanceRowDto {
  @ApiProperty({ format: 'uuid' })
  driverId: string;

  @ApiPropertyOptional({ nullable: true })
  employeeId: string | null;

  @ApiProperty({ description: 'Staff username / staff ID' })
  username: string;

  @ApiProperty({ description: 'Display name' })
  fullName: string;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Assigned branch (for multi-branch reporting)',
  })
  branchId: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Current OPEN shift (started at login), if any',
  })
  currentShiftId: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'When the open shift started',
  })
  shiftStartedAt: Date | null;

  @ApiProperty({
    description:
      'Sum of COMPLETED orders with cash still with driver (PAID_TO_DRIVER)',
  })
  heldCashTotal: string;

  @ApiProperty({
    description: 'Number of such orders included in heldCashTotal',
  })
  pendingSettlementOrderCount: number;
}

export class DriverBalanceResponseDto {
  @ApiProperty({ type: [DriverBalanceRowDto] })
  drivers: DriverBalanceRowDto[];
}

export class HandoverResultDto {
  @ApiProperty()
  settledOrderCount: number;

  @ApiProperty({
    description: 'Exact ledger amount moved to HANDED_OVER_TO_OFFICE',
  })
  systemHandoverTotal: string;

  @ApiProperty({ format: 'uuid' })
  shiftId: string;
}
