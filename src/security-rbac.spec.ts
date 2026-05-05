import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ROLES_KEY } from './auth/decorators/roles.decorator';
import { RolesGuard } from './auth/guards/roles.guard';
import { CallCenterController } from './call-center/call-center.controller';
import { CustomersService } from './customers/customers.service';
import { OrdersController } from './orders/orders.controller';

const COLLECTIONS_ALLOWED = [
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
];

function handlerRoles(
  controller: object,
  method: string,
): SafariRole[] | undefined {
  return Reflect.getMetadata(
    ROLES_KEY,
    Object.getPrototypeOf(controller)[method],
  ) as SafariRole[] | undefined;
}

function makeGuardContext(role: SafariRole): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user: { role } }),
    }),
  } as unknown as ExecutionContext;
}

describe('collections and WhatsApp RBAC security lock', () => {
  it('DRIVER cannot access /collections backend endpoints and receives Forbidden', async () => {
    const guard = new RolesGuard(
      {
        getAllAndOverride: jest.fn((key: string) =>
          key === ROLES_KEY ? COLLECTIONS_ALLOWED : undefined,
        ),
      } as any,
      { roleHasCapability: jest.fn() } as any,
    );

    await expect(
      guard.canActivate(makeGuardContext(SafariRole.DRIVER)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('MANAGER cannot access /whatsapp-tools backend endpoints and receives Forbidden', async () => {
    const guard = new RolesGuard(
      {
        getAllAndOverride: jest.fn((key: string) =>
          key === ROLES_KEY ? COLLECTIONS_ALLOWED : undefined,
        ),
      } as any,
      { roleHasCapability: jest.fn() } as any,
    );

    await expect(
      guard.canActivate(makeGuardContext(SafariRole.MANAGER)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('direct API routes expose only the call-center security roles', () => {
    const callCenter = new CallCenterController({} as any);
    const orders = new OrdersController({} as any);

    for (const method of [
      'operationsSummary',
      'markOrderReminderSent',
      'ensureOrderPaymentLink',
      'sendPaymentLinkToCustomerWhatsapp',
      'markCollectionOrderPaid',
      'getDailyCollections',
      'getDailyCollectionsReconciliation',
    ]) {
      expect(handlerRoles(callCenter, method)).toEqual(COLLECTIONS_ALLOWED);
    }
    expect(handlerRoles(orders, 'listCollectionsUnpaidOnline')).toEqual(
      COLLECTIONS_ALLOWED,
    );
  });

  it('UI nav hides collections and WhatsApp tools from DRIVER and MANAGER', () => {
    const source = readFileSync(
      resolve(__dirname, '../web/src/modules/shared/nav/nav-items.ts'),
      'utf8',
    );

    const collectionsBlock = source.match(
      /export const collectionsItem:[\s\S]*?};/,
    )?.[0];
    const whatsappBlock = source.match(
      /export const whatsappToolsItem:[\s\S]*?};/,
    )?.[0];

    expect(collectionsBlock).toContain('CALL_CENTER');
    expect(collectionsBlock).toContain('CALL_CENTER_SUPERVISOR');
    expect(collectionsBlock).not.toContain('DRIVER');
    expect(collectionsBlock).not.toContain('MANAGER');
    expect(collectionsBlock).not.toContain('GENERAL_MANAGER');

    expect(whatsappBlock).toContain('CALL_CENTER');
    expect(whatsappBlock).toContain('CALL_CENTER_SUPERVISOR');
    expect(whatsappBlock).not.toContain('DRIVER');
    expect(whatsappBlock).not.toContain('MANAGER');
    expect(whatsappBlock).not.toContain('GENERAL_MANAGER');
  });

  it('route guard blocks manual URL entry by redirecting unauthorized users to /403', () => {
    const requireAccess = readFileSync(
      resolve(__dirname, '../web/src/modules/shared/components/require-access.tsx'),
      'utf8',
    );
    const authLayout = readFileSync(
      resolve(
        __dirname,
        '../web/src/modules/shared/components/shell/auth-layout.tsx',
      ),
      'utf8',
    );
    const appRoutes = readFileSync(
      resolve(__dirname, '../web/src/App.tsx'),
      'utf8',
    );

    expect(requireAccess).toContain('<Navigate to="/403" replace />');
    expect(authLayout).toContain("'/collections'");
    expect(authLayout).toContain("'/whatsapp-tools'");
    expect(authLayout).toContain('SECURITY_LOCKED_PATHS.has(pathname)');
    expect(appRoutes).toContain('path="/403"');
  });

  it('sanitizes customer financial fields for MANAGER and DRIVER roles', async () => {
    const core = {
      list: jest.fn().mockResolvedValue([{ id: 'customer-1' }]),
      listByPhonePriority: jest.fn(),
      getById: jest.fn().mockResolvedValue({ id: 'customer-1' }),
    };
    const debt = { getCustomerDebtSnapshot: jest.fn() };
    const subscription = { getCustomerSubscriptionSnapshot: jest.fn() };
    const service = new CustomersService(
      core as any,
      debt as any,
      subscription as any,
    );

    await expect(service.list('', SafariRole.MANAGER)).resolves.toEqual([
      { customer: { id: 'customer-1' } },
    ]);
    await expect(
      service.getProfileWithFinancials('customer-1', SafariRole.DRIVER),
    ).resolves.toEqual({ customer: { id: 'customer-1' } });
    expect(debt.getCustomerDebtSnapshot).not.toHaveBeenCalled();
    expect(subscription.getCustomerSubscriptionSnapshot).not.toHaveBeenCalled();
  });
});
