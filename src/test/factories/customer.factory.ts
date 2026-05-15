import { randomUUID } from 'node:crypto';
import { Customer, CustomerWallet, Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export type TestCustomer = Customer & { wallet: CustomerWallet };

function phoneDigitsFromUuid(id: string): string {
  return id.replace(/\D/g, '').padEnd(7, '0').slice(0, 7);
}

export async function createCustomer(
  prisma: Db,
  branchId?: string | null,
  overrides: Partial<Prisma.CustomerCreateInput> = {},
): Promise<TestCustomer> {
  const id = randomUUID();
  const data = {
    id,
    phone: `6${phoneDigitsFromUuid(id)}`,
    displayName: `Test Customer ${id}`,
    address: 'Test Address',
    originBranch: branchId ? { connect: { id: branchId } } : undefined,
    wallet: {
      create: {
        id: randomUUID(),
        balance: new Prisma.Decimal('0.0000'),
        debt: new Prisma.Decimal('0.0000'),
      },
    },
    ...overrides,
  } as Prisma.CustomerCreateInput;

  const customer = await prisma.customer.create({
    data,
    include: { wallet: true },
  });

  if (!customer.wallet) {
    throw new Error('Customer factory failed to create wallet');
  }

  return customer as TestCustomer;
}
