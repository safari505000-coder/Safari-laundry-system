/**
 * STEAL-3: assertOrderInCollectionScope enforces branch-scope for CALL_CENTER.
 * CC agents cannot access orders outside their branch.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { CallCenterService } from './call-center.service';
import type { JwtUser } from '../auth/decorators/current-user.decorator';

const ORDER_ID = 'order-11111111-1111-4111-8111-111111111111';
const BRANCH_A = 'branch-aaaa-aaaa-aaaa-aaaaaaaaaaaaa';
const BRANCH_B = 'branch-bbbb-bbbb-bbbb-bbbbbbbbbbbbb';
const DRIVER_ID = 'driver-11111111-1111-4111-8111-111111111111';
const CC_USER_ID = 'cc-11111111-1111-4111-8111-111111111111';

function makeActor(role: SafariRole, branchId: string | null, userId: string): JwtUser {
  return { userId, role, branchId } as JwtUser;
}

function makeOrderWithDriver(driverBranchId: string) {
  return {
    id: ORDER_ID,
    driverId: DRIVER_ID,
    driver: { branchId: driverBranchId },
    customer: { originBranchId: null },
  };
}

function makeOrderWithoutDriver(customerOriginBranchId: string) {
  return {
    id: ORDER_ID,
    driverId: null,
    driver: null,
    customer: { originBranchId: customerOriginBranchId },
  };
}

function makePrisma(order: object | null) {
  return {
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  const svc = new CallCenterService(
    prisma as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
  return svc;
}

describe('DEGRADE-2 — statement token revocation', () => {
  it('revokedTokenJtis rejects a revoked token in getPublicStatement', async () => {
    const prisma = makePrisma(makeOrderWithDriver(BRANCH_A));
    const svc = makeService(prisma);
    const jti = 'test-jti-abc123';

    (svc as unknown as { revokedTokenJtis: Set<string> }).revokedTokenJtis.add(jti);

    const revoked = (svc as unknown as { revokedTokenJtis: Set<string> }).revokedTokenJtis;
    expect(revoked.has(jti)).toBe(true);

    svc.revokeStatementToken(jti);
    expect(revoked.has(jti)).toBe(true);
  });
});

describe('STEAL-3 — assertOrderInCollectionScope for CALL_CENTER', () => {
  it('CALL_CENTER agent in branch A → rejects order whose driver is in branch B', async () => {
    const prisma = makePrisma(makeOrderWithDriver(BRANCH_B));
    const svc = makeService(prisma);
    const actor = makeActor(SafariRole.CALL_CENTER, BRANCH_A, CC_USER_ID);

    await expect(
      (svc as unknown as { assertOrderInCollectionScope(o: string, a: JwtUser): Promise<void> })
        .assertOrderInCollectionScope(ORDER_ID, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('CALL_CENTER agent in branch A → allows order whose driver is in branch A', async () => {
    const prisma = makePrisma(makeOrderWithDriver(BRANCH_A));
    const svc = makeService(prisma);
    const actor = makeActor(SafariRole.CALL_CENTER, BRANCH_A, CC_USER_ID);

    await expect(
      (svc as unknown as { assertOrderInCollectionScope(o: string, a: JwtUser): Promise<void> })
        .assertOrderInCollectionScope(ORDER_ID, actor),
    ).resolves.toBeUndefined();
  });

  it('CALL_CENTER agent in branch A → rejects order with customer origin branch B and no driver', async () => {
    const prisma = makePrisma(makeOrderWithoutDriver(BRANCH_B));
    const svc = makeService(prisma);
    const actor = makeActor(SafariRole.CALL_CENTER, BRANCH_A, CC_USER_ID);

    await expect(
      (svc as unknown as { assertOrderInCollectionScope(o: string, a: JwtUser): Promise<void> })
        .assertOrderInCollectionScope(ORDER_ID, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('CALL_CENTER_SUPERVISOR has unrestricted access across all branches', async () => {
    const prisma = makePrisma(makeOrderWithDriver(BRANCH_B));
    const svc = makeService(prisma);
    const actor = makeActor(SafariRole.CALL_CENTER_SUPERVISOR, BRANCH_A, CC_USER_ID);

    await expect(
      (svc as unknown as { assertOrderInCollectionScope(o: string, a: JwtUser): Promise<void> })
        .assertOrderInCollectionScope(ORDER_ID, actor),
    ).resolves.toBeUndefined();
    // Should not even look up the order
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('OWNER has unrestricted access', async () => {
    const prisma = makePrisma(makeOrderWithDriver(BRANCH_B));
    const svc = makeService(prisma);
    const actor = makeActor(SafariRole.OWNER, null, CC_USER_ID);

    await expect(
      (svc as unknown as { assertOrderInCollectionScope(o: string, a: JwtUser): Promise<void> })
        .assertOrderInCollectionScope(ORDER_ID, actor),
    ).resolves.toBeUndefined();
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when order does not exist', async () => {
    const prisma = makePrisma(null);
    const svc = makeService(prisma);
    const actor = makeActor(SafariRole.CALL_CENTER, BRANCH_A, CC_USER_ID);

    await expect(
      (svc as unknown as { assertOrderInCollectionScope(o: string, a: JwtUser): Promise<void> })
        .assertOrderInCollectionScope(ORDER_ID, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
