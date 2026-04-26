import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ActivateSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  customerId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  planId: string;

  /**
   * V19.7.4 — when true, the activation will also walk unpaid invoices
   * for this customer oldest-first (FIFO) and mark any that are fully
   * covered by the debt-reduction portion of the activation as paid.
   * The Call Center issue/upgrade dialog also sends true so payment-link
   * invoices (unsettled receivables) clear together with `wallet.debt`.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoCloseInvoices?: boolean;
}
