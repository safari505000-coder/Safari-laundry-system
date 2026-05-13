import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO صف رصيد السائق — يشمل أرصدة النقد والمدفوعات الرقمية المعلقة
 * Driver balance row with pending cash and digital payment amounts by method.
 */
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
      'Sum of COMPLETED CASH orders with cash still with driver (PAID_TO_DRIVER). Kept for backward compatibility.',
  })
  heldCashTotal: string;

  @ApiProperty({
    description: 'Number of such cash orders included in heldCashTotal',
  })
  pendingSettlementOrderCount: number;

  /*
   * Dastur §3 — Combined "pending invoices" (not yet accountant-verified).
   * Includes every COMPLETED order the driver issued whose cashStatus is still
   * PAID_TO_DRIVER, regardless of POS payment method. This is the staff-
   * accountability liability: any invoice issued but not yet closed out
   * against the accountant's books.
   */

  @ApiProperty({ description: 'Pending CASH invoices issued by driver (KD).' })
  pendingCashKd: string;

  @ApiProperty({ description: 'Pending K-Net invoices issued by driver (KD).' })
  pendingKnetKd: string;

  @ApiProperty({
    description: 'Pending Payment-Link invoices issued by driver (KD).',
  })
  pendingLinkKd: string;

  @ApiProperty({
    description: 'Pending online-gateway invoices issued by driver (KD).',
  })
  pendingOnlineKd: string;

  @ApiProperty({
    description: 'Total pending invoices (cash + knet + link + online, KD).',
  })
  pendingTotalKd: string;

  @ApiProperty({
    description:
      'Number of unverified invoices across every payment method for this driver.',
  })
  pendingInvoiceCount: number;
}

/**
 * DTO استجابة أرصدة السائقين — قائمة بجميع السائقين وأرصدتهم المعلقة
 * Driver balance response DTO wrapping the list of all driver balance rows.
 */
export class DriverBalanceResponseDto {
  @ApiProperty({ type: [DriverBalanceRowDto] })
  drivers: DriverBalanceRowDto[];
}

/**
 * DTO نتيجة تأكيد التسليم النقدي من السائق إلى المدير
 * Cash handover confirmation result DTO with settled order count and system total.
 */
export class HandoverResultDto {
  @ApiProperty()
  settledOrderCount: number;

  @ApiProperty({
    description: 'Exact ledger amount moved to HANDED_OVER_TO_OFFICE',
  })
  systemHandoverTotal: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      "The driver's current OPEN shift at handover time, stamped onto orders as `handoverShiftId` for audit. Null when no shift is open — cash handover is independent of the shift cycle (Dastur §3).",
  })
  shiftId: string | null;

  @ApiProperty({
    description:
      'Stored receipt path under /uploads when a slip was attached at confirm time; null for the Dastur §3 two-step flow where the slip comes later.',
    nullable: true,
    required: false,
  })
  bankDepositReceiptUrl: string | null;
}
