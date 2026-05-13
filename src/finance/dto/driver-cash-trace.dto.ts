import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

/**
 * V19.10 — "Driver Cash Trace" report.
 *
 * Traces each KD of cash from the moment the driver collected it at the
 * customer's door until it lands, verified, in the corporate bank
 * account. Stages:
 *
 *   1) COLLECTED_BY_DRIVER  — Order.completedAt in range,
 *      posPaymentMethod = CASH. We aggregate by driver.
 *
 *   2) HANDED_TO_MANAGER   — ManagerCashCustody row created
 *      (receivedFromDriverAt in range). Bag status starts as
 *      PENDING_DEPOSIT.
 *
 *   3) SLIP_UPLOADED       — Bag status moves to AWAITING_VERIFICATION
 *      once the branch manager attaches the bank deposit slip.
 *
 *   4) VERIFIED_AT_BANK    — Accountant verified the slip (cycle closes).
 *      Bag status = VERIFIED.
 *
 *   5) REJECTED            — Accountant rejected the slip and the bag
 *      is back under the manager's liability. status = REJECTED.
 *
 * `pendingWithDriverKd = max(0, collectedKd − handedToManagerKd)` is the
 * cash the driver still physically holds. This is the number that
 * answers the owner's real question: "who still has my cash?"
 */
/**
 * معايير استعلام تقرير تتبع نقد السائق — يتتبع رحلة النقد من السائق إلى البنك
 * Query DTO for the Driver Cash Trace report tracing cash from driver to bank.
 * Supports date range, driver, and branch filtering.
 * @since V19.10
 */
export class DriverCashTraceQueryDto {
  @ApiProperty({
    description: 'Inclusive lower bound of the reporting window (ISO-8601).',
    example: '2026-04-21T00:00:00.000Z',
  })
  @IsISO8601()
  from: string;

  @ApiProperty({
    description: 'Inclusive upper bound of the reporting window (ISO-8601).',
    example: '2026-04-21T23:59:59.999Z',
  })
  @IsISO8601()
  to: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional: scope the report to a single driver.',
  })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional: scope the report to a single branch.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/**
 * DTO حقيبة نقدية في تقرير تتبع نقد السائق — تمثل تسليماً واحداً إلى المدير
 * Driver Cash Trace bag DTO representing a single cash handover to a branch manager.
 */
export class DriverCashTraceBagDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Cash in the bag (KWD, fixed-4).' })
  amountKd: string;

  @ApiProperty({ description: 'How many COD orders the bag settled.' })
  settledOrderCount: number;

  @ApiProperty({
    description: 'Current lifecycle state of the bag.',
    enum: [
      'PENDING_DEPOSIT',
      'AWAITING_VERIFICATION',
      'VERIFIED',
      'REJECTED',
    ],
  })
  status:
    | 'PENDING_DEPOSIT'
    | 'AWAITING_VERIFICATION'
    | 'VERIFIED'
    | 'REJECTED';

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  managerId: string | null;

  @ApiPropertyOptional({ nullable: true })
  managerName: string | null;

  @ApiPropertyOptional({ nullable: true })
  managerUsername: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  branchId: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchName: string | null;

  @ApiProperty({ format: 'date-time' })
  receivedFromDriverAt: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  slipUploadedAt: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  verifiedAt: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  rejectedAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  rejectionReason: string | null;
}

/**
 * DTO بيانات السائق في تقرير تتبع النقد — ملخص كامل للدورة النقدية
 * Driver Cash Trace driver DTO with full cash cycle summary per driver.
 */
export class DriverCashTraceDriverDto {
  @ApiProperty({ format: 'uuid' })
  driverId: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  fullName: string;

  @ApiPropertyOptional({ nullable: true })
  branchId: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchName: string | null;

  @ApiProperty({ description: 'Cash collected in window (KWD).' })
  collectedKd: string;

  @ApiProperty({ description: 'COD orders contributing to the above.' })
  collectedOrderCount: number;

  @ApiProperty({ description: 'Cash handed to a branch manager in window.' })
  handedToManagerKd: string;

  @ApiProperty({ description: 'Number of custody bags in window.' })
  handedToManagerBagCount: number;

  @ApiProperty({
    description:
      'max(0, collectedKd - handedToManagerKd). What the driver still physically holds.',
  })
  pendingWithDriverKd: string;

  @ApiProperty({ description: 'Bag sum VERIFIED by accountant (at bank).' })
  atBankKd: string;

  @ApiProperty({
    description: 'Bag sum PENDING_DEPOSIT (manager has it, no slip yet).',
  })
  pendingAtManagerKd: string;

  @ApiProperty({
    description:
      'Bag sum AWAITING_VERIFICATION (slip uploaded, accountant pending).',
  })
  awaitingVerificationKd: string;

  @ApiProperty({ description: 'Bag sum REJECTED by accountant.' })
  rejectedKd: string;

  @ApiProperty({ type: [DriverCashTraceBagDto] })
  bags: DriverCashTraceBagDto[];
}

/**
 * DTO مؤشرات الأداء الرئيسية لتقرير تتبع نقد السائقين
 * KPI totals DTO for the Driver Cash Trace report across all active drivers.
 */
export class DriverCashTraceKpisDto {
  @ApiProperty() totalCollectedKd: string;
  @ApiProperty() totalHandedToManagerKd: string;
  @ApiProperty() totalAtBankKd: string;
  @ApiProperty() totalPendingWithDriverKd: string;
  @ApiProperty() totalPendingAtManagerKd: string;
  @ApiProperty() totalAwaitingVerificationKd: string;
  @ApiProperty() totalRejectedKd: string;
  @ApiProperty() totalCollectedOrderCount: number;
  @ApiProperty() totalBagCount: number;
}

/**
 * DTO النطاق الزمني لتقرير تتبع نقد السائق
 * Date range DTO for the Driver Cash Trace report.
 */
export class DriverCashTraceRangeDto {
  @ApiProperty() from: string;
  @ApiProperty() to: string;
}

/**
 * DTO استجابة تقرير تتبع نقد السائقين — يشمل النطاق ومؤشرات الأداء وبيانات السائقين
 * Driver Cash Trace response DTO with date range, KPIs, and per-driver data.
 * @since V19.10
 */
export class DriverCashTraceResponseDto {
  @ApiProperty({ type: DriverCashTraceRangeDto })
  range: DriverCashTraceRangeDto;

  @ApiProperty({ type: DriverCashTraceKpisDto })
  kpis: DriverCashTraceKpisDto;

  @ApiProperty({ type: [DriverCashTraceDriverDto] })
  drivers: DriverCashTraceDriverDto[];
}
