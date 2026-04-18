import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

/**
 * Dastur V1.5.3 — "Extend Subscription" (تمديد).
 *
 * Pushes the current `subscriptionExpiresAt` forward by N calendar days on
 * the SAME plan. No money moves, no wallet balance/debt change — this is
 * strictly a date adjustment for the management room.
 *
 * Upper bound (365d) prevents a typo ("365" vs "3650") from nuking the
 * subscription lifecycle. Lower bound of 1 prevents zero/negative days.
 */
export class ExtendSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  customerId: string;

  @ApiProperty({ minimum: 1, maximum: 365, example: 30 })
  @IsInt()
  @Min(1)
  @Max(365)
  extensionDays: number;
}
