import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO ملخص محافظ عملاء المالك — يُجمّع الالتزامات والديون والإحصاءات
 * Owner customer wallet summary DTO aggregating total wallet liabilities, customer debts,
 * subscription usage, and debt settled by subscriptions.
 */
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

  @ApiProperty({
    description:
      'Cumulative debt additions sourced from issued invoices (ORDER_WALLET_SETTLEMENT.addedToDebt)',
    example: '18.5000',
  })
  debtFromIssuedInvoices: string;

  @ApiProperty({
    description:
      'Cumulative debt additions sourced from subscription overuse (negative subscription balance)',
    example: '5.0000',
  })
  debtFromSubscriptionOveruse: string;

  @ApiProperty({
    description:
      'Cumulative debt settled by subscription activations (SUBSCRIPTION_ACTIVATION.debtSettled)',
    example: '7.0000',
  })
  debtSettledBySubscriptions: string;

  @ApiProperty({ example: '4.2500' })
  debtByBranch: string;

  @ApiProperty({ example: '8.0000' })
  debtByDriver: string;

  @ApiProperty({ example: '1.5000' })
  debtByOwner: string;

  @ApiProperty({ example: '2.7500' })
  debtByCallCenter: string;

  @ApiProperty({
    description:
      'Cumulative subscription wallet consumption from completed subscription-backed orders',
    example: '64.2500',
  })
  totalSubscriptionUsage: string;
}
