import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LedgerTransactionType } from '@prisma/client';

export class SettlementHistoryRowDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ enum: LedgerTransactionType })
  type: LedgerTransactionType;

  @ApiPropertyOptional({
    description: 'Cash collected (subscription), if applicable',
  })
  totalCollected?: string;

  @ApiPropertyOptional({ description: 'Amount applied to customer debt' })
  debtSettled?: string;

  @ApiPropertyOptional({ description: 'Net amount credited to prepaid balance' })
  creditedToBalance?: string;

  @ApiProperty()
  balanceAfter: string;

  @ApiProperty()
  debtAfter: string;

  @ApiPropertyOptional()
  planName?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  orderId?: string;
}
