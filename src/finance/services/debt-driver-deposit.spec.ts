/**
 * STEAL-2: Driver deposit settlement uses Prisma.Decimal throughout.
 * Float-boundary orders must not settle beyond the approved amount.
 */
import { CashStatus, OrderStatus, PosPaymentMethod, Prisma } from '@prisma/client';
import { DebtService } from './debt.service';

const DRIVER_ID = 'driver-11111111-1111-4111-8111-111111111111';

function makeOrder(id: string, totalPrice: string) {
  return { id, totalPrice: new Prisma.Decimal(totalPrice) };
}

function makePrismaDb(orders: ReturnType<typeof makeOrder>[]) {
  return {
    order: {
      findMany: jest.fn().mockResolvedValue(orders),
      updateMany: jest.fn().mockResolvedValue({ count: orders.length }),
    },
  };
}

function makeService(db: ReturnType<typeof makePrismaDb>) {
  return new DebtService(
    db as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
}

describe('STEAL-2 — driver deposit settlement uses Decimal arithmetic', () => {
  it('10 KD approved, 10 orders × 1.0001 KD → exactly 9 settle (not 10)', async () => {
    const orders = Array.from({ length: 10 }, (_, i) =>
      makeOrder(`order-${i}`, '1.0001'),
    );
    const db = makePrismaDb(orders);
    const svc = makeService(db);

    const result = await svc.applyDriverDepositSettlement(DRIVER_ID, 10.0);

    // 9 orders × 1.0001 = 9.0009; 10th order would be 10.0010 > 10.0000 + 0.0001 = 10.0001
    // so only 9 should settle
    expect(result.settledOrderCount).toBe(9);
    const settled = new Prisma.Decimal(result.settledAmountKd);
    expect(settled.toFixed(4)).toBe('9.0009');
    // The 10th order (total = 10.0010 KD) must NOT have been settled
    expect(settled.lt(new Prisma.Decimal('10.0001'))).toBe(true);
  });

  it('exact match: 10 KD approved, 10 orders × 1.0000 KD → 10 settle', async () => {
    const orders = Array.from({ length: 10 }, (_, i) =>
      makeOrder(`order-${i}`, '1.0000'),
    );
    const db = makePrismaDb(orders);
    const svc = makeService(db);

    const result = await svc.applyDriverDepositSettlement(DRIVER_ID, 10.0);

    expect(result.settledOrderCount).toBe(10);
    expect(result.settledAmountKd).toBe('10.0000');
  });

  it('approved amount 0 → no orders settled', async () => {
    const db = makePrismaDb([makeOrder('o1', '5.0000')]);
    const svc = makeService(db);

    const result = await svc.applyDriverDepositSettlement(DRIVER_ID, 0);

    expect(result.settledOrderCount).toBe(0);
    expect(result.settledAmountKd).toBe('0.0000');
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('sum of settled orders does not exceed approved amount', async () => {
    const orders = [
      makeOrder('o1', '3.3333'),
      makeOrder('o2', '3.3333'),
      makeOrder('o3', '3.3333'),
      makeOrder('o4', '3.3333'),
    ];
    const db = makePrismaDb(orders);
    const svc = makeService(db);

    const result = await svc.applyDriverDepositSettlement(DRIVER_ID, 10.0);

    const settled = new Prisma.Decimal(result.settledAmountKd);
    expect(settled.lte(new Prisma.Decimal('10.0000').plus('0.0001'))).toBe(true);
  });
});
