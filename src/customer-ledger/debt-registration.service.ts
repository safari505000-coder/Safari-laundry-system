import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DoubleEntryJournalService,
  JOURNAL_ACCOUNTS,
} from '../general-ledger/double-entry-journal.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_LINK_RECEIVABLE_SOURCE,
  paymentLinkReceivableSourceRef,
  type PrismaTx,
} from './customer-ledger.types';
import { WalletService } from './wallet.service';

@Injectable()
export class DebtRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletService,
    private readonly journal: DoubleEntryJournalService,
  ) {}

  /**
   * تسجيل مديونية فورية لطلب رابط الدفع
   * Register immediate debt for a payment link order
   *
   * @param tx - معاملة قاعدة البيانات / Database transaction
   * @param orderId - معرف الطلب / Order ID
   * @param customerId - معرف العميل / Customer ID
   * @param amountKd - المبلغ بالدينار الكويتي / Amount in KWD
   * @returns لا تُرجع قيمة / No return value
   */
  async registerPendingPaymentLinkReceivableTx(
    tx: PrismaTx,
    orderId: string,
    customerId: string,
    amountKd: Prisma.Decimal | string | number,
  ): Promise<void> {
    const amount = new Prisma.Decimal(amountKd);
    if (amount.lessThanOrEqualTo(0)) return;

    const sourceRef = paymentLinkReceivableSourceRef(orderId);
    const existing = await tx.journalEntry.findUnique({
      where: { sourceRef },
      select: { id: true },
    });
    if (existing) return;

    const wallet = await this.wallets.getOrCreateWalletTx(tx, customerId);
    await this.wallets.lockCustomerWalletForUpdateTx(tx, wallet.id);
    const existingAfterLock = await tx.journalEntry.findUnique({
      where: { sourceRef },
      select: { id: true },
    });
    if (existingAfterLock) return;

    const lockedWallet = await tx.customerWallet.findUniqueOrThrow({
      where: { id: wallet.id },
      select: { debt: true },
    });
    await tx.customerWallet.update({
      where: { id: wallet.id },
      data: { debt: lockedWallet.debt.add(amount) },
    });

    await this.journal.appendBalanced(tx, {
      source: PAYMENT_LINK_RECEIVABLE_SOURCE,
      sourceRef,
      actorUserId: '00000000-0000-0000-0000-000000000000',
      customerId,
      orderId,
      lines: [
        {
          accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
          debit: amount,
          meta: { event: PAYMENT_LINK_RECEIVABLE_SOURCE, orderId },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.REVENUE,
          credit: amount,
          meta: { event: PAYMENT_LINK_RECEIVABLE_SOURCE, orderId },
        },
      ],
    });
  }
}
