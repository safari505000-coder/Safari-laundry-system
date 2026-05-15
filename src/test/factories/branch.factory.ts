import { randomUUID } from 'node:crypto';
import { Branch, Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

function phoneDigitsFromUuid(id: string): string {
  return id.replace(/\D/g, '').padEnd(7, '0').slice(0, 7);
}

export async function createBranch(
  prisma: Db,
  overrides: Partial<Prisma.BranchCreateInput> = {},
): Promise<Branch> {
  const id = randomUUID();
  const data = {
    id,
    name: `Test Branch ${id}`,
    location: 'Test Location',
    phone: `5${phoneDigitsFromUuid(id)}`,
    isActive: true,
    ...overrides,
  } as Prisma.BranchCreateInput;

  return prisma.branch.create({
    data,
  });
}
