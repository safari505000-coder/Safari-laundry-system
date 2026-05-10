import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerCollectionStatusKind } from '@prisma/client';

/**
 * V19.x — One aggregated customer row in the AR / Outstanding view.
 * `priorityScore` is intentionally informational — nothing in the
 * codebase escalates, blocks, or messages off the back of it.
 */
export class OutstandingRowDto {
  @ApiProperty()
  customerId!: string;

  @ApiPropertyOptional()
  name?: string | null;

  @ApiProperty()
  phone!: string;

  @ApiPropertyOptional()
  phone2?: string | null;

  @ApiPropertyOptional()
  driverId?: string | null;

  @ApiPropertyOptional()
  driverName?: string | null;

  @ApiProperty({
    description:
      'V23.3 — Canonical KWD string (4dp, banker-rounded). Sum of `Order.totalPrice` over Collections-scope receivable orders (UNPAID + open FIFO debt-on-account), same predicate as the red KPI. Type changed from `number` → `string` for canonical-money-purity alignment; consumers must compare via `compareKwdStrings` rather than raw subtraction.',
    example: '3.2500',
  })
  totalDueKd!: string;

  @ApiPropertyOptional({
    description:
      'V20.3.1 / V23.3 — Σ REMAINING balance (gross − payments − wallet absorption) over the same Collections-scope rows, expressed as canonical 4dp KWD string. Differs from totalDueKd whenever an in-scope invoice has prior partial payments. Use this for the partial-payment-aware red KPI; totalDueKd is preserved for back-compat.',
    example: '2.5000',
  })
  remainingDueKd?: string;

  @ApiPropertyOptional({
    description:
      'V20.3.1 / V23.3 — Σ paid (real PAYMENT rows; excludes wallet absorption) across the in-scope rows, expressed as canonical 4dp KWD string.',
    example: '0.7500',
  })
  paidKd?: string;

  @ApiProperty({ description: 'Count of open invoices for this customer.' })
  invoicesCount!: number;

  @ApiPropertyOptional({
    description: 'ISO timestamp of the most recent open invoice.',
  })
  lastOrderAt?: string | null;

  @ApiPropertyOptional({
    description: 'Earliest dueDate among the open invoices, if any.',
  })
  earliestDueDate?: string | null;

  @ApiProperty({
    description:
      'Days late based on the earliest dueDate among open invoices. 0 when no dueDate is set.',
  })
  daysLate!: number;

  @ApiProperty({
    description:
      'Suggested call-priority score: totalDueKd * 0.6 + daysLate * 0.4. NEVER triggers automation.',
  })
  priorityScore!: number;

  @ApiProperty({ enum: CustomerCollectionStatusKind })
  status!: CustomerCollectionStatusKind;

  @ApiProperty()
  blocked!: boolean;

  @ApiPropertyOptional()
  note?: string | null;

  /**
   * V20.3.2 — true iff a `CustomerSubscription` row exists for
   * this customer with `status === ACTIVE` AND `expiresAt > now`.
   * Independent dimension — the customer appears in Outstanding
   * because they OWE money, not because they are or aren't a
   * subscriber. Surfaced so the UI can render an independent
   * SUBSCRIBER badge alongside the HAS_DEBT / PARTIALLY_PAID
   * / OVERDUE badges.
   */
  @ApiPropertyOptional({
    description:
      'V20.3.2 — true iff customer currently holds an ACTIVE CustomerSubscription with `expiresAt > now`. Independent of debt state.',
  })
  hasActiveSubscription?: boolean;

  /**
   * V20.3.2 — ISO timestamp of the active subscription's expiry.
   * Null when the customer has no subscription row OR no
   * currently-active row.
   */
  @ApiPropertyOptional({
    description:
      'V20.3.2 — ISO expiry timestamp of the active CustomerSubscription. Null when customer is not currently an active subscriber.',
  })
  subscriptionExpiresAt?: string | null;
}

export class OutstandingResponseDto {
  @ApiProperty({ type: [OutstandingRowDto] })
  rows!: OutstandingRowDto[];

  @ApiProperty()
  totalCustomers!: number;

  @ApiProperty()
  totalInvoices!: number;

  @ApiPropertyOptional({
    description:
      'Readonly per-driver summary derived from the same canonical Outstanding rows. Used by reporting UIs to avoid client-side financial grouping.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        driverId: { type: 'string', nullable: true },
        driverName: { type: 'string' },
        customers: { type: 'number' },
        invoices: { type: 'number' },
        totalRemainingKd: { type: 'string', example: '3.250' },
        maxDaysLate: { type: 'number' },
      },
    },
  })
  driverSummaries?: Array<{
    driverId: string | null;
    driverName: string;
    customers: number;
    invoices: number;
    totalRemainingKd: string;
    maxDaysLate: number;
  }>;

  @ApiProperty({
    description:
      'Canonical AR headline total. Always sourced from OrdersService.sumCollectionsDebtTotalKd().',
    example: '3.250',
  })
  totalDueKd!: string;

  @ApiPropertyOptional({
    description:
      'V20.3.1 — Σ remaining balance over the same scope (red-card-correct). When `V20_3_TRUE_ACCOUNTING=true` this also matches the journal AR balance for the customer set.',
    example: '2.500',
  })
  remainingDueKd?: string;

  @ApiProperty({
    enum: ['COLLECTIONS_ENGINE'],
    description: 'Financial source lock for the headline AR total.',
  })
  source!: 'COLLECTIONS_ENGINE';

  @ApiProperty()
  blockedCount!: number;

  @ApiProperty()
  lateCount!: number;

  @ApiProperty()
  riskCount!: number;

  @ApiProperty()
  generatedAt!: string;

  @ApiProperty()
  fromIso!: string;

  @ApiProperty()
  toIso!: string;
}
