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
      'Sum of `Order.totalPrice` over Collections-scope receivable orders (UNPAID + open FIFO debt-on-account), same predicate as the red KPI.',
  })
  totalDueKd!: number;

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
}

export class OutstandingResponseDto {
  @ApiProperty({ type: [OutstandingRowDto] })
  rows!: OutstandingRowDto[];

  @ApiProperty()
  totalCustomers!: number;

  @ApiProperty()
  totalInvoices!: number;

  @ApiProperty({
    description:
      'Canonical AR headline total. Always sourced from OrdersService.sumCollectionsDebtTotalKd().',
    example: '3.250',
  })
  totalDueKd!: string;

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
