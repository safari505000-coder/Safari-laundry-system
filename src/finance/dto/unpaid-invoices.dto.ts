import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * V19.10 — "Unpaid Invoices List" report (قائمة مديونيات الفواتير).
 *
 * Single source of truth: `DebtLedgerEntry` with
 * `source = INVOICE_SHORTFALL`. Each entry represents an amount that
 * the customer still owes from a specific invoice. Entries are joined
 * back to their parent order, customer, branch, and issuing employee
 * so the page can reproduce the invoice context.
 *
 * Aggregation is per-invoice: multiple DebtLedgerEntry rows for the
 * same order (e.g. a partial top-up that still left a residual) are
 * summed into one row.
 *
 * `currentCustomerDebtKd` carries the customer's wallet-level open
 * balance so the UI can hide invoices whose owners have since cleared
 * everything (see ?onlyOpen=true).
 */
export class UnpaidInvoicesQueryDto {
  @ApiPropertyOptional({
    description:
      'Inclusive lower bound of the debt-creation window (ISO-8601). Filters DebtLedgerEntry.createdAt.',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive upper bound of the debt-creation window (ISO-8601).',
    example: '2026-04-22T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Branch that issued the invoice.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Employee (driver / branch manager) that issued the invoice.',
  })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({
    description: 'Customer phone substring (digits only, primary or secondary).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  customerPhone?: string;
}

export class UnpaidInvoiceRowDto {
  @ApiProperty({ format: 'uuid' })
  orderId: string;

  @ApiPropertyOptional({ nullable: true })
  serialNumber: string | null;

  @ApiPropertyOptional({ nullable: true })
  invoiceNumber: string | null;

  @ApiProperty({ format: 'date-time' })
  issuedAt: string;

  @ApiProperty({ format: 'uuid' })
  customerId: string;

  @ApiProperty()
  customerName: string;

  @ApiPropertyOptional({ nullable: true })
  customerPhone: string | null;

  @ApiPropertyOptional({ nullable: true })
  customerPhone2: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  branchId: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchName: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  actorUserId: string | null;

  @ApiPropertyOptional({ nullable: true })
  actorUserName: string | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: [
      'OWNER',
      'GENERAL_MANAGER',
      'MANAGER',
      'ACCOUNTANT',
      'SUPERVISOR',
      'DRIVER',
      'CALL_CENTER',
      'CALL_CENTER_SUPERVISOR',
      'FLEET_SUPERVISOR',
      'VIEWER',
    ],
  })
  actorUserRole: string | null;

  @ApiProperty({ description: 'Invoice total (KWD, fixed-4).' })
  invoiceTotalKd: string;

  @ApiProperty({
    description:
      'Raw invoice shortfall recorded as INVOICE_SHORTFALL in DebtLedgerEntry (KWD, fixed-4).',
  })
  debtAmountKd: string;

  @ApiProperty({
    description:
      'V19.11.2 — Σ DebtLedgerEntry PAYMENT rows attributed to this specific invoice (KWD, fixed-4). Customer-level PAYMENTs (orderId=null) are FIFO-allocated across the customer\'s open invoices; their share surfaces here too.',
  })
  paidKd: string;

  @ApiProperty({
    description:
      'V19.11.2 — Remaining open amount on this specific invoice after per-order and FIFO customer-level payments are applied (KWD, fixed-4). `max(debtAmountKd − paidKd, 0)`.',
  })
  remainingKd: string;

  @ApiProperty({
    description: 'Number of DebtLedgerEntry rows rolled into this invoice.',
  })
  entryCount: number;

  @ApiProperty({
    description: "Customer's current open debt across all their invoices (KWD, fixed-4).",
  })
  currentCustomerDebtKd: string;

  @ApiProperty({
    description:
      '`true` when this invoice still has a non-zero remaining balance after payment allocation.',
  })
  isOpen: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  lastEntryAt: string;
}

export class UnpaidInvoicesKpisDto {
  @ApiProperty() invoiceCount: number;
  @ApiProperty() openInvoiceCount: number;
  @ApiProperty() customerCount: number;
  @ApiProperty() openCustomerCount: number;
  @ApiProperty({
    description:
      'Sum of invoice totals (Order.totalPrice) across every row in scope.',
  })
  totalInvoicesKd: string;
  @ApiProperty({
    description:
      'Σ of raw INVOICE_SHORTFALL across every row (before subtracting payments).',
  })
  totalDebtKd: string;
  @ApiProperty({
    description:
      'V19.11.2 — Σ of payments applied to the shown invoices (per-order PAYMENT + FIFO share of customer-level PAYMENT).',
  })
  totalPaidKd: string;
  @ApiProperty({
    description:
      'Σ of remaining open amounts. Matches /collections totalMarketDebtKd.',
  })
  openDebtKd: string;
  @ApiProperty() avgDebtPerInvoiceKd: string;
}

export class UnpaidInvoicesResponseDto {
  @ApiProperty({ format: 'date-time', nullable: true })
  from: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  to: string | null;

  @ApiProperty({ type: UnpaidInvoicesKpisDto })
  kpis: UnpaidInvoicesKpisDto;

  @ApiProperty({ type: [UnpaidInvoiceRowDto] })
  rows: UnpaidInvoiceRowDto[];
}
