import { randomUUID } from 'node:crypto';
import { Account, AccountType, Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

const REQUIRED_ACCOUNTS = [
  { code: '1300', name: 'Accounts Receivable', type: AccountType.ASSET },
  { code: '1100', name: 'Cash', type: AccountType.ASSET },
  { code: '1200', name: 'KNET Clearing', type: AccountType.ASSET },
  { code: '1110', name: 'KNET Clearing', type: AccountType.ASSET },
  { code: '1210', name: 'Online Payment Clearing', type: AccountType.ASSET },
  { code: '4100', name: 'Revenue', type: AccountType.REVENUE },
  { code: '4000', name: 'Legacy Revenue', type: AccountType.REVENUE },
  { code: '2100', name: 'Wallet Liability', type: AccountType.LIABILITY },
  { code: '4200', name: 'Revenue Returns', type: AccountType.REVENUE },
  { code: '5100', name: 'Adjustments', type: AccountType.EXPENSE },
  { code: '5200', name: 'Debt Discounts', type: AccountType.EXPENSE },
  { code: '5300', name: 'Promotional Expense', type: AccountType.EXPENSE },
  { code: '6100', name: 'Legacy Promotional Expense', type: AccountType.EXPENSE },
] satisfies Array<Pick<Prisma.AccountCreateInput, 'code' | 'name' | 'type'>>;

export async function seedJournalAccounts(prisma: Db): Promise<Account[]> {
  const accounts: Account[] = [];

  for (const account of REQUIRED_ACCOUNTS) {
    accounts.push(
      await prisma.account.upsert({
        where: { code: account.code },
        update: {
          name: account.name,
          type: account.type,
          isActive: true,
        },
        create: {
          id: randomUUID(),
          ...account,
          isActive: true,
        },
      }),
    );
  }

  return accounts;
}
