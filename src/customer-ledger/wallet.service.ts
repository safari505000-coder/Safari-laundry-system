import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from './customer-ledger.types';

@Injectable()
export class WalletService {
  /**
   * Concurrent checkouts for the same new customer can race on `upsert` create;
   * the second tx may get P2002 on `customerId` unique — re-read the row.
   */
  async getOrCreateWalletTx(tx: PrismaTx, customerId: string) {
    try {
      return await tx.customerWallet.upsert({
        where: { customerId },
        create: { customerId },
        update: {},
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return tx.customerWallet.findUniqueOrThrow({
          where: { customerId },
        });
      }
      throw e;
    }
  }

  /**
   * V20.1-v2 — Phase 13 concurrency safety helper.
   *
   * Acquires a row-level lock on the `CustomerWallet` row for the
   * duration of the enclosing transaction (PostgreSQL `SELECT … FOR
   * UPDATE`). Any other transaction attempting `SELECT … FOR UPDATE`
   * or `UPDATE` on the same row will block until commit/rollback,
   * eliminating the race between concurrent wallet settlements.
   *
   * Lock failures are fatal. Continuing without this lock can
   * double-spend wallet credit during concurrent settlement.
   */
  async lockCustomerWalletForUpdateTx(
    tx: PrismaTx,
    walletId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT 1 FROM "CustomerWallet" WHERE "id" = ${walletId}::uuid FOR UPDATE`;
  }
}
