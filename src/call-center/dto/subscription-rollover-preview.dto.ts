import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * V19.4 — CC pack #2 rollover preview payload.
 *
 * Powers the "are you sure?" modal shown before a subscription is
 * activated. Gives the operator a read-only snapshot of what WILL
 * happen so they can abort before the ledger is written.
 *
 * Read-only: no side effects server-side.
 */
export class SubscriptionRolloverPreviewDto {
  @ApiProperty({
    description:
      'True when the customer has a prior subscription that will be rolled over. False for first-time activations.',
  })
  hasPrevious!: boolean;

  @ApiPropertyOptional({
    description:
      'Signed decimal string (4dp). Positive = prepaid balance that will carry forward; negative = debt carried forward; zero = exactly even.',
    example: '3.5000',
  })
  carriedBalanceKd?: string;

  @ApiPropertyOptional({
    description: 'Previous plan display name (snapshot from predecessor row).',
    example: 'Monthly Saver',
  })
  previousPlanName?: string;

  @ApiPropertyOptional({
    description: 'ISO timestamp of when the predecessor was last activated.',
  })
  previousActivatedAtIso?: string;

  @ApiPropertyOptional({
    description: 'ISO timestamp of when the predecessor expires/expired.',
  })
  previousExpiresAtIso?: string;

  @ApiPropertyOptional({
    description:
      'Current wallet prepaid balance at preview time (may drift until activate is called).',
    example: '5.0000',
  })
  currentWalletBalanceKd?: string;

  @ApiPropertyOptional({
    description: 'Current wallet debt at preview time.',
    example: '1.5000',
  })
  currentWalletDebtKd?: string;
}
