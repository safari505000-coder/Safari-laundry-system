/**
 * Cash Explainability — STRICTLY READ-ONLY view.
 *
 * Surfaces the answer to "where did this driver's cash come from?"
 * for ops & finance staff without touching any classifier logic.
 *
 * The numbers here are DERIVED from the SAME `lastSnapshot` the
 * classifier observes (so totals reconcile with `/classified.drivers[].amount`),
 * but the projection itself is policy-free: no severity, no
 * thresholds, no aging gate. It only groups and sums.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CashExplainBreakdownEntryDto {
  @ApiProperty({
    description: 'Kuwait local date the cash originated (YYYY-MM-DD).',
    example: '2026-05-01',
  })
  date!: string;

  @ApiProperty({
    description:
      'Sum of cash amounts (KD, fixed-4) recorded on this date for this driver. Same units as `/classified.drivers[].amount`.',
    example: '60.0000',
  })
  amount!: string;

  @ApiProperty({
    description: 'Number of distinct cash flows aggregated into this date bucket.',
    example: 3,
  })
  count!: number;
}

export class CashExplainDriverDto {
  @ApiProperty()
  driverId!: string;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty({
    description:
      'Total live cash held by this driver across all open dates (KD, fixed-4). Sums to `breakdown[].amount`.',
    example: '111.0000',
  })
  totalCash!: string;

  @ApiProperty({
    description:
      'Age in hours of the OLDEST flow this driver still holds (rounded to 2 decimals). 0 when the driver has no live cash.',
    example: 50.5,
  })
  oldestCashAgeHours!: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Earliest origin date (Kuwait YYYY-MM-DD) across this driver\'s flows, or null when the driver has no live cash.',
  })
  oldestOriginDate!: string | null;

  @ApiProperty({ description: 'Total number of underlying cash flows.' })
  flowCount!: number;

  @ApiProperty({
    type: [CashExplainBreakdownEntryDto],
    description:
      'Per-day breakdown sorted oldest → newest. Together the entries reconcile to `totalCash`.',
  })
  breakdown!: CashExplainBreakdownEntryDto[];
}

export class CashExplainResponseDto {
  @ApiProperty({ description: 'ISO timestamp when the projection ran.' })
  generatedAt!: string;

  @ApiProperty({ description: 'Number of drivers with at least one live flow.' })
  totalDrivers!: number;

  @ApiProperty({
    description:
      'Sum of every live flow across every driver in the (scoped) view, KD fixed-4.',
    example: '275.4000',
  })
  totalCash!: string;

  @ApiProperty({ type: [CashExplainDriverDto] })
  drivers!: CashExplainDriverDto[];

  @ApiProperty({
    description:
      'Hard contract marker — this endpoint never mutates anything, ever.',
  })
  readOnly!: true;

  @ApiProperty({
    description:
      'Hard contract marker — this layer is descriptive only; it has no opinions on severity, aging, or risk.',
  })
  advisoryOnly!: true;
}
