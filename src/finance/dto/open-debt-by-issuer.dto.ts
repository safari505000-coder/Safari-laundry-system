import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class OpenDebtByIssuerQueryDto {
  @ApiPropertyOptional({
    description:
      'Optional branch scope. When set, only invoices whose debt-ledger branchId matches are counted.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/**
 * V19.11.4 — NET open debt grouped by the invoice's original issuer.
 *
 * Unlike the legacy `/reports/debt-by-category` endpoint (which returns
 * gross debt issued in a window), this snapshot subtracts every
 * matching PAYMENT entry and performs the same per-customer FIFO
 * allocation as `/unpaid-invoices`, so:
 *
 *   Σ rows[].openDebtKd  ===  /unpaid-invoices openDebtKd
 *                        ===  /collections totalMarketDebtKd
 *
 * The dashboard "توزيع الديون" chart consumes this endpoint so
 * operators never see conflicting numbers across screens.
 */
export class OpenDebtByIssuerRowDto {
  /** DRIVER | BRANCH | OTHER — issuer role bucket. */
  @ApiProperty()
  issuer!: 'DRIVER' | 'BRANCH' | 'OTHER';

  @ApiProperty({ example: '1387.0000' })
  openDebtKd!: string;

  @ApiProperty({ example: 14 })
  openInvoiceCount!: number;

  @ApiProperty({ example: 9 })
  openCustomerCount!: number;
}

export class OpenDebtByIssuerResponseDto {
  @ApiProperty({ type: [OpenDebtByIssuerRowDto] })
  rows!: OpenDebtByIssuerRowDto[];

  /** Total NET open debt across all issuer buckets. Matches /unpaid-invoices. */
  @ApiProperty({ example: '1428.2500' })
  totalOpenDebtKd!: string;

  @ApiProperty({ example: 23 })
  openInvoiceCount!: number;

  @ApiProperty({ example: 11 })
  openCustomerCount!: number;

  @ApiProperty({
    description: 'ISO timestamp when the snapshot was computed.',
    example: '2026-04-22T12:30:45.123Z',
  })
  computedAt!: string;
}
