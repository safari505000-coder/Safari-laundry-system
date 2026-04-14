import { ApiProperty } from '@nestjs/swagger';

export class OwnerCustomerWalletSummaryDto {
  @ApiProperty({
    description:
      'Sum of all customer wallet balances (outstanding prepaid credit / liabilities)',
    example: '1250.5000',
  })
  totalWalletLiabilities: string;

  @ApiProperty({
    description: 'Sum of all customer wallet debt (amounts owed beyond credit)',
    example: '42.0000',
  })
  totalCustomerDebts: string;
}
