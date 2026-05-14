import { randomUUID } from 'node:crypto';
import { Order, Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export async function createOrder(
  prisma: Db,
  customerId: string,
  driverId?: string | null,
  overrides: Partial<Prisma.OrderCreateInput> = {},
): Promise<Order> {
  const id = randomUUID();
  const data = {
    id,
    totalPrice: new Prisma.Decimal('10.0000'),
    invoiceNumber: `INV-${id}`,
    serialNumber: `TEST-${id}`,
    customer: { connect: { id: customerId } },
    driver: driverId ? { connect: { id: driverId } } : undefined,
    ...overrides,
  } as Prisma.OrderCreateInput;

  return prisma.order.create({
    data,
  });
}
