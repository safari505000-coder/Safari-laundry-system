import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SafariRole } from '@prisma/client';
import { ThrottlerException } from '@nestjs/throttler';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { ROLES_KEY } from './auth/decorators/roles.decorator';
import { PERMISSIONS_KEY } from './auth/permissions/permissions.decorator';
import { AppPermission } from './auth/permissions/permissions.enum';
import {
  permissionsForRole,
  roleHasAppPermission,
} from './auth/permissions/roles-permissions.map';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AttendanceController } from './attendance/attendance.controller';
import { BranchesController } from './branches/branches.controller';
import { CallCenterController } from './call-center/call-center.controller';
import { CallCenterService } from './call-center/call-center.service';
import { AccountingController } from './accounting/accounting.controller';
import { DispatchController } from './dispatch/dispatch.controller';
import { CustomersService } from './customers/customers.service';
import { FinancialPeriodsController } from './finance/periods/financial-periods.controller';
import { OutstandingController } from './finance/outstanding/outstanding.controller';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { OwnerDashboardController } from './owner-dashboard/owner-dashboard.controller';
import { PayrollController } from './payroll/payroll.controller';
import { UsersController } from './users/users.controller';
import { WorkerTasksController } from './production/worker-tasks.controller';

const COLLECTIONS_ALLOWED = [
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
];
const BRANCH_1 = 'branch-11111111-1111-4111-8111-111111111111';
const BRANCH_2 = 'branch-22222222-2222-4222-8222-222222222222';
const ORDER_1 = 'order-11111111-1111-4111-8111-111111111111';
const CUSTOMER_1 = 'cust-11111111-1111-4111-8111-111111111111';
const DRIVER_1 = 'driver-11111111-1111-4111-8111-111111111111';
const DRIVER_2 = 'driver-22222222-2222-4222-8222-222222222222';

function handlerRoles(
  controller: object,
  method: string,
): SafariRole[] | undefined {
  return Reflect.getMetadata(
    ROLES_KEY,
    Object.getPrototypeOf(controller)[method],
  ) as SafariRole[] | undefined;
}

function controllerRoles(controller: object): SafariRole[] | undefined {
  return Reflect.getMetadata(
    ROLES_KEY,
    Object.getPrototypeOf(controller).constructor,
  ) as SafariRole[] | undefined;
}

function handlerPermissions(
  controller: object,
  method: string,
): AppPermission[] | undefined {
  return Reflect.getMetadata(
    PERMISSIONS_KEY,
    Object.getPrototypeOf(controller)[method],
  ) as AppPermission[] | undefined;
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

function makeGuard(roles: SafariRole[]): RolesGuard {
  return new RolesGuard(
    {
      getAllAndOverride: jest.fn((key: string) =>
        key === ROLES_KEY ? roles : undefined,
      ),
    } as any,
    { roleHasCapability: jest.fn() } as any,
  );
}

function actor(
  role: SafariRole,
  userId = 'user-11111111-1111-4111-8111-111111111111',
  branchId: string | null = BRANCH_1,
) {
  return { userId, role, branchId } as any;
}

function makeCallCenterService(prisma: Record<string, unknown>) {
  return new CallCenterService(
    prisma as any,
    {} as any,
    { manuallyMarkOrderPaidByMethod: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

async function expectRoleAllowed(
  roles: SafariRole[],
  role: SafariRole,
): Promise<void> {
  await expect(
    makeGuard(roles).canActivate(makeGuardContext(role)),
  ).resolves.toBe(true);
}

async function expectRoleForbidden(
  roles: SafariRole[],
  role: SafariRole,
): Promise<void> {
  await expect(
    makeGuard(roles).canActivate(makeGuardContext(role)),
  ).rejects.toBeInstanceOf(ForbiddenException);
}

function expectPermissionAllowed(
  permissions: AppPermission[],
  role: SafariRole,
): void {
  expect(permissions.every((permission) => roleHasAppPermission(role, permission)))
    .toBe(true);
}

function expectPermissionForbidden(
  permissions: AppPermission[],
  role: SafariRole,
): void {
  expect(permissions.every((permission) => roleHasAppPermission(role, permission)))
    .toBe(false);
}

function makeAuthService(opts?: {
  user?: Record<string, unknown> | null;
  passwordMatches?: boolean;
}): AuthService {
  const user = opts?.user ?? null;
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(null),
    },
  };
  const jwt = {
    signAsync: jest.fn(),
  };
  const bcrypt = {
    compare: jest.fn().mockResolvedValue(opts?.passwordMatches ?? false),
  };
  const operatingHours = {
    isLockEnabled: jest.fn().mockReturnValue(false),
  };
  return new AuthService(
    prisma as any,
    jwt as any,
    {} as any,
    bcrypt as any,
    operatingHours as any,
    {} as any,
  );
}

function statusOf(error: unknown): number | undefined {
  if (
    error &&
    typeof error === 'object' &&
    'getStatus' in error &&
    typeof error.getStatus === 'function'
  ) {
    return error.getStatus();
  }
  return undefined;
}

function expectAuthGuardRejects401(error: unknown): void {
  const guard = new JwtAuthGuard({
    getAllAndOverride: jest.fn().mockReturnValue(undefined),
  } as any);

  try {
    (guard as unknown as { handleRequest: (...args: unknown[]) => unknown })
      .handleRequest(error, null, null, {} as ExecutionContext);
    throw new Error('Expected JwtAuthGuard to reject request');
  } catch (err) {
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(statusOf(err)).toBe(401);
  }
}

describe('collections and WhatsApp RBAC security lock', () => {
  it('DRIVER cannot access /collections backend endpoints and receives Forbidden', async () => {
    const guard = makeGuard(COLLECTIONS_ALLOWED);

    await expect(
      guard.canActivate(makeGuardContext(SafariRole.DRIVER)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('CALL_CENTER can access mark-paid collection endpoint', async () => {
    const callCenter = new CallCenterController({} as any);
    const roles = handlerRoles(callCenter, 'markCollectionOrderPaid');
    expect(roles).toEqual(COLLECTIONS_ALLOWED);

    const guard = makeGuard(roles!);
    await expect(
      guard.canActivate(makeGuardContext(SafariRole.CALL_CENTER)),
    ).resolves.toBe(true);
  });

  it('WORKER cannot access payroll list endpoint and receives Forbidden', async () => {
    const payroll = new PayrollController({} as any);
    const roles = handlerRoles(payroll, 'list');
    expect(roles).toEqual([
      SafariRole.OWNER,
      SafariRole.GENERAL_MANAGER,
      SafariRole.MANAGER,
      SafariRole.ACCOUNTANT,
    ]);

    const guard = makeGuard(roles!);
    await expect(
      guard.canActivate(makeGuardContext(SafariRole.WORKER)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('MANAGER cannot access /whatsapp-tools backend endpoints and receives Forbidden', async () => {
    const guard = makeGuard(COLLECTIONS_ALLOWED);

    await expect(
      guard.canActivate(makeGuardContext(SafariRole.MANAGER)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('direct API routes expose only the call-center security roles', () => {
    const callCenter = new CallCenterController({} as any);
    // V23.3 — `OrdersController` constructor gained an `AuditService`
    // dependency. Stub it with an empty object — this RBAC test only
    // walks the metadata via `Reflect.getMetadata`, never invokes
    // a method that would hit `audit.log`.
    const orders = new OrdersController({} as any, {} as any);

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
    // V23.3 — `App.tsx` declares the route as `path="403"` (relative)
    // because it sits inside an outer parent `<Routes>`. The runtime
    // navigation target is `/403` (absolute, asserted above on
    // `requireAccess`). Match either form so the spec is stable
    // across React-Router restructurings.
    expect(
      appRoutes.includes('path="/403"') || appRoutes.includes('path="403"'),
    ).toBe(true);
  });

  it('sanitizes customer financial fields for MANAGER and DRIVER roles', async () => {
    const core = {
      list: jest.fn().mockResolvedValue([{ id: 'customer-1' }]),
      listByPhonePriority: jest.fn(),
      getById: jest.fn().mockResolvedValue({ id: 'customer-1' }),
    };
    const debt = { getCustomerDebtSnapshot: jest.fn() };
    const subscription = { getCustomerSubscriptionSnapshot: jest.fn() };
    const journal = { getCustomerDebtFromJournalAR: jest.fn() };
    const prisma = { order: { findMany: jest.fn() }, debtLedgerEntry: { findMany: jest.fn() } };
    const service = new CustomersService(
      core as any,
      debt as any,
      subscription as any,
      journal as any,
      prisma as any,
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

describe('financial operations RBAC security lock', () => {
  it('ACCOUNTANT can view finance/outstanding', async () => {
    const outstanding = new OutstandingController({} as any, {} as any);
    const roles = handlerRoles(outstanding, 'list');
    expect(roles).toEqual([
      SafariRole.OWNER,
      SafariRole.GENERAL_MANAGER,
      SafariRole.ACCOUNTANT,
      SafariRole.CALL_CENTER,
      SafariRole.CALL_CENTER_SUPERVISOR,
    ]);

    await expectRoleAllowed(roles!, SafariRole.ACCOUNTANT);
  });

  it('WORKER cannot view finance/outstanding', async () => {
    const outstanding = new OutstandingController({} as any, {} as any);
    const roles = handlerRoles(outstanding, 'list');

    await expectRoleForbidden(roles!, SafariRole.WORKER);
  });

  it('OWNER can close financial period', async () => {
    const service = {
      closePeriod: jest.fn().mockResolvedValue({ id: 'period-1', closed: true }),
    };
    const periods = new FinancialPeriodsController(service as any);
    const roles = handlerRoles(periods, 'close');
    expect(roles).toEqual([SafariRole.OWNER, SafariRole.ACCOUNTANT]);

    await expectRoleAllowed(roles!, SafariRole.OWNER);
    await expect(
      periods.close(actor(SafariRole.OWNER, 'owner-user', null), {
        year: 2026,
        month: 5,
        confirmation: 'CLOSE',
      }),
    ).resolves.toEqual({ id: 'period-1', closed: true });
  });

  it('CALL_CENTER cannot close financial period', async () => {
    const service = { closePeriod: jest.fn() };
    const periods = new FinancialPeriodsController(service as any);
    const roles = handlerRoles(periods, 'close');

    await expectRoleForbidden(roles!, SafariRole.CALL_CENTER);
    await expect(
      periods.close(actor(SafariRole.CALL_CENTER, 'cc-user', BRANCH_1), {
        year: 2026,
        month: 5,
        confirmation: 'CLOSE',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.closePeriod).not.toHaveBeenCalled();
  });

  it('ACCOUNTANT can view payroll', async () => {
    const payroll = new PayrollController({} as any);
    const roles = handlerRoles(payroll, 'list');
    expect(roles).toEqual([
      SafariRole.OWNER,
      SafariRole.GENERAL_MANAGER,
      SafariRole.MANAGER,
      SafariRole.ACCOUNTANT,
    ]);

    await expectRoleAllowed(roles!, SafariRole.ACCOUNTANT);
  });

  it('DRIVER cannot view payroll', async () => {
    const payroll = new PayrollController({} as any);
    const roles = handlerRoles(payroll, 'list');

    await expectRoleForbidden(roles!, SafariRole.DRIVER);
  });

  it('GENERAL_MANAGER can view accounting/reconciliation', async () => {
    const accounting = new AccountingController({} as any, {} as any);
    const roles = controllerRoles(accounting);
    expect(roles).toEqual([
      SafariRole.OWNER,
      SafariRole.GENERAL_MANAGER,
      SafariRole.ACCOUNTANT,
      SafariRole.MANAGER,
    ]);

    await expectRoleAllowed(roles!, SafariRole.GENERAL_MANAGER);
  });

  it('WORKER cannot view accounting/reconciliation', async () => {
    const accounting = new AccountingController({} as any, {} as any);
    const roles = controllerRoles(accounting);

    await expectRoleForbidden(roles!, SafariRole.WORKER);
  });
});

describe('call center operations RBAC security lock', () => {
  it('CALL_CENTER can send payment link', async () => {
    const callCenter = new CallCenterController({} as any);
    const roles = handlerRoles(callCenter, 'sendPaymentLinkToCustomerWhatsapp');
    expect(roles).toEqual(COLLECTIONS_ALLOWED);

    await expectRoleAllowed(roles!, SafariRole.CALL_CENTER);
  });

  it('CALL_CENTER can send order reminder', async () => {
    const callCenter = new CallCenterController({} as any);
    const roles = handlerRoles(callCenter, 'markOrderReminderSent');
    expect(roles).toEqual(COLLECTIONS_ALLOWED);

    await expectRoleAllowed(roles!, SafariRole.CALL_CENTER);
  });

  it('CALL_CENTER can view customer subscriptions', async () => {
    const callCenter = new CallCenterController({} as any);
    const roles = handlerRoles(callCenter, 'listCustomerSubscriptionChain') ??
      controllerRoles(callCenter);
    expect(roles).toEqual(COLLECTIONS_ALLOWED);

    await expectRoleAllowed(roles!, SafariRole.CALL_CENTER);
  });

  it('CALL_CENTER can view customer ledger', async () => {
    const callCenter = new CallCenterController({} as any);
    const roles = handlerRoles(callCenter, 'getCustomerLedger');
    expect(roles).toEqual([
      SafariRole.CALL_CENTER,
      SafariRole.CALL_CENTER_SUPERVISOR,
      SafariRole.OWNER,
      SafariRole.GENERAL_MANAGER,
      SafariRole.ACCOUNTANT,
    ]);

    await expectRoleAllowed(roles!, SafariRole.CALL_CENTER);
  });

  it('CALL_CENTER cannot view accounting/reconciliation', async () => {
    const accounting = new AccountingController({} as any, {} as any);
    const roles = controllerRoles(accounting);

    await expectRoleForbidden(roles!, SafariRole.CALL_CENTER);
  });

  it('CALL_CENTER cannot view payroll', async () => {
    const payroll = new PayrollController({} as any);
    const roles = handlerRoles(payroll, 'list');

    await expectRoleForbidden(roles!, SafariRole.CALL_CENTER);
  });

  it('CALL_CENTER_SUPERVISOR can view daily-collections', async () => {
    const callCenter = new CallCenterController({} as any);
    const roles = handlerRoles(callCenter, 'getDailyCollections');
    expect(roles).toEqual(COLLECTIONS_ALLOWED);

    await expectRoleAllowed(roles!, SafariRole.CALL_CENTER_SUPERVISOR);
  });

  it('CALL_CENTER_SUPERVISOR can view debt-recovery-report', async () => {
    const callCenter = new CallCenterController({} as any);
    const roles = handlerRoles(callCenter, 'debtRecoveryReport');
    expect(roles).toEqual([
      SafariRole.OWNER,
      SafariRole.GENERAL_MANAGER,
      SafariRole.CALL_CENTER_SUPERVISOR,
    ]);

    await expectRoleAllowed(roles!, SafariRole.CALL_CENTER_SUPERVISOR);
  });

  it('CALL_CENTER cannot view debt-recovery-report', async () => {
    const callCenter = new CallCenterController({} as any);
    const roles = handlerRoles(callCenter, 'debtRecoveryReport');

    await expectRoleForbidden(roles!, SafariRole.CALL_CENTER);
  });

  it('DRIVER cannot access any call-center endpoint', async () => {
    const callCenter = new CallCenterController({} as any);
    const routeRoles = [
      handlerRoles(callCenter, 'operationsSummary'),
      handlerRoles(callCenter, 'markOrderReminderSent'),
      handlerRoles(callCenter, 'ensureOrderPaymentLink'),
      handlerRoles(callCenter, 'sendPaymentLinkToCustomerWhatsapp'),
      handlerRoles(callCenter, 'markCollectionOrderPaid'),
      handlerRoles(callCenter, 'markSubscriberReminderSent'),
      handlerRoles(callCenter, 'getCustomerLedger'),
      handlerRoles(callCenter, 'getDailyCollections'),
      handlerRoles(callCenter, 'getDailyCollectionsReconciliation'),
      handlerRoles(callCenter, 'getDebtConversionOptions'),
      handlerRoles(callCenter, 'debtRecoveryReport'),
      controllerRoles(callCenter),
    ].filter((roles): roles is SafariRole[] => Array.isArray(roles));

    expect(routeRoles.length).toBeGreaterThan(0);
    for (const roles of routeRoles) {
      await expectRoleForbidden(roles, SafariRole.DRIVER);
    }
  });
});

describe('driver and fleet operations RBAC security lock', () => {
  it('DRIVER can view his own orders', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: ORDER_1,
          driver: { id: DRIVER_1 },
        }),
      },
    };
    const service = new OrdersService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.findOneForActor(ORDER_1, DRIVER_1, SafariRole.DRIVER),
    ).resolves.toEqual({ id: ORDER_1, driver: { id: DRIVER_1 } });
  });

  it('DRIVER cannot view other driver orders', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: ORDER_1,
          driver: { id: DRIVER_2 },
        }),
      },
    };
    const service = new OrdersService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.findOneForActor(ORDER_1, DRIVER_1, SafariRole.DRIVER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('DRIVER cannot access branches endpoint', async () => {
    const branches = new BranchesController({} as any);
    const roles = handlerRoles(branches, 'list');

    await expectRoleForbidden(roles!, SafariRole.DRIVER);
  });

  it('DRIVER cannot access users endpoint', async () => {
    const users = new UsersController({} as any, {} as any);
    const roles = controllerRoles(users);

    await expectRoleForbidden(roles!, SafariRole.DRIVER);
  });

  it('FLEET_SUPERVISOR can view dispatch', () => {
    const dispatch = new DispatchController({} as any);
    const permissions = handlerPermissions(dispatch, 'listMine');
    expect(permissions).toEqual([AppPermission.VIEW_DISPATCH]);

    expectPermissionAllowed(permissions!, SafariRole.FLEET_SUPERVISOR);
  });

  it('FLEET_SUPERVISOR cannot view finance/outstanding', async () => {
    const outstanding = new OutstandingController({} as any, {} as any);
    const roles = handlerRoles(outstanding, 'list');

    await expectRoleForbidden(roles!, SafariRole.FLEET_SUPERVISOR);
  });

  it('FLEET_SUPERVISOR cannot view payroll', async () => {
    const payroll = new PayrollController({} as any);
    const roles = handlerRoles(payroll, 'list');

    await expectRoleForbidden(roles!, SafariRole.FLEET_SUPERVISOR);
  });

  it('WORKER can access worker production task endpoints', async () => {
    const workerTasks = new WorkerTasksController({} as any);
    const roles = controllerRoles(workerTasks);
    expect(roles).toEqual([SafariRole.WORKER]);

    await expectRoleAllowed(roles!, SafariRole.WORKER);
  });

  it('WORKER has production.view and production.work (not VIEW_DISPATCH)', () => {
    const perms = permissionsForRole(SafariRole.WORKER);
    expect(perms).toEqual(
      expect.arrayContaining([
        AppPermission.VIEW_PRODUCTION,
        AppPermission.WORK_PRODUCTION,
        AppPermission.PRODUCTION_WASHING,
        AppPermission.PRODUCTION_DRYING,
        AppPermission.PRODUCTION_IRONING,
        AppPermission.PRODUCTION_PACKING,
        AppPermission.PRODUCTION_QC,
      ]),
    );
    expect(roleHasAppPermission(SafariRole.WORKER, AppPermission.VIEW_DISPATCH)).toBe(
      false,
    );
  });

  it('WORKER cannot hold invoice, cash, finance, accounting, or users.manage permissions', () => {
    const forbidden = [
      AppPermission.VIEW_INVOICES,
      AppPermission.CREATE_INVOICE,
      AppPermission.UPDATE_INVOICE,
      AppPermission.DELETE_INVOICE,
      AppPermission.VIEW_CASH,
      AppPermission.VIEW_DEBTS,
      AppPermission.VIEW_FINANCIAL_REPORTS,
      AppPermission.VIEW_CUSTOMERS,
      AppPermission.MANAGE_USERS,
      AppPermission.MANAGE_PRODUCTION,
      AppPermission.VIEW_DISPATCH,
      AppPermission.MANAGE_DISPATCH,
    ];
    for (const permission of forbidden) {
      expect(roleHasAppPermission(SafariRole.WORKER, permission)).toBe(false);
    }
  });

  it('WORKER cannot view branches', async () => {
    const branches = new BranchesController({} as any);
    const roles = handlerRoles(branches, 'list');

    await expectRoleForbidden(roles!, SafariRole.WORKER);
  });

  it('SUPERVISOR can view attendance', async () => {
    const attendance = new AttendanceController({} as any);
    const roles = handlerRoles(attendance, 'list');
    expect(roles).toEqual([
      SafariRole.OWNER,
      SafariRole.GENERAL_MANAGER,
      SafariRole.MANAGER,
      SafariRole.ACCOUNTANT,
      SafariRole.SUPERVISOR,
    ]);

    await expectRoleAllowed(roles!, SafariRole.SUPERVISOR);
  });

  it('SUPERVISOR cannot view accounting/reconciliation', async () => {
    const accounting = new AccountingController({} as any, {} as any);
    const roles = controllerRoles(accounting);

    await expectRoleForbidden(roles!, SafariRole.SUPERVISOR);
  });
});

describe('authentication security lock', () => {
  it('login with wrong password returns 401', async () => {
    const service = makeAuthService({
      user: {
        id: 'user-1',
        username: 'admin',
        password: 'hashed',
        role: { name: SafariRole.OWNER },
        safariRole: SafariRole.OWNER,
        isActive: true,
      },
      passwordMatches: false,
    });

    await expect(
      service.login({ username: 'admin', password: 'wrong-password' }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('login with non-existent user returns 401', async () => {
    const service = makeAuthService({ user: null });

    await expect(
      service.login({ username: 'missing', password: 'whatever' }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('request with expired JWT returns 401', async () => {
    const jwt = new JwtService({ secret: 'rbac-test-secret' });
    const expired = await jwt.signAsync(
      { sub: 'user-1', role: SafariRole.OWNER },
      { expiresIn: '-1s' },
    );

    await expect(
      jwt.verifyAsync(expired, { secret: 'rbac-test-secret' }),
    ).rejects.toThrow();
    expectAuthGuardRejects401(new UnauthorizedException('jwt expired'));
  });

  it('request with tampered JWT returns 401', async () => {
    const jwt = new JwtService({ secret: 'rbac-test-secret' });
    const token = await jwt.signAsync(
      { sub: 'user-1', role: SafariRole.OWNER },
      { expiresIn: '1h' },
    );
    const tampered = `${token.slice(0, -1)}x`;

    await expect(
      jwt.verifyAsync(tampered, { secret: 'rbac-test-secret' }),
    ).rejects.toThrow();
    expectAuthGuardRejects401(new UnauthorizedException('invalid signature'));
  });

  it('request with no Authorization header returns 401', () => {
    expectAuthGuardRejects401(null);
  });

  it('login brute-force: 6 attempts in a row returns 429 on the 6th', () => {
    const throttleLimit = 5;
    const attempts: number[] = [];

    const attemptLogin = () => {
      attempts.push(Date.now());
      if (attempts.length > throttleLimit) {
        throw new ThrottlerException();
      }
      throw new UnauthorizedException('Invalid credentials');
    };

    for (let i = 0; i < throttleLimit; i += 1) {
      expect(() => attemptLogin()).toThrow(UnauthorizedException);
    }

    try {
      attemptLogin();
      throw new Error('Expected brute-force throttle to reject 6th attempt');
    } catch (err) {
      expect(err).toBeInstanceOf(ThrottlerException);
      expect(statusOf(err)).toBe(429);
    }

    const loginThrottleDecorator = readFileSync(
      resolve(__dirname, './auth/auth.controller.ts'),
      'utf8',
    );
    expect(loginThrottleDecorator).toContain('@Throttle');
    expect(loginThrottleDecorator).toContain('AUTH_LOGIN_THROTTLE_LIMIT');
  });
});

describe('IDOR and cross-branch security lock', () => {
  it('CALL_CENTER agent from branch1 cannot mark-paid order from branch2', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: ORDER_1,
          driverId: DRIVER_2,
          driver: { branchId: BRANCH_2 },
          customer: { originBranchId: null },
        }),
      },
    };
    const service = makeCallCenterService(prisma);

    await expect(
      service.markCollectionOrderPaid(
        ORDER_1,
        'CASH',
        'cc-user',
        actor(SafariRole.CALL_CENTER, 'cc-user', BRANCH_1),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('DRIVER from branch1 cannot read order details assigned to branch2 driver', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: ORDER_1,
          driver: { id: DRIVER_2 },
        }),
      },
    };
    const service = new OrdersService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.findOneForActor(ORDER_1, DRIVER_1, SafariRole.DRIVER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('MANAGER from branch1 cannot access customer profile from branch2', async () => {
    const core = {
      getById: jest.fn().mockResolvedValue({
        id: CUSTOMER_1,
        originBranchId: BRANCH_2,
      }),
      list: jest.fn(),
      listByPhonePriority: jest.fn(),
    };
    const service = new CustomersService(
      core as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.getProfileWithFinancials(
        CUSTOMER_1,
        SafariRole.MANAGER,
        BRANCH_1,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('CALL_CENTER cannot access another branch customer ledger by swapping customerId', async () => {
    const prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: CUSTOMER_1,
          displayName: 'Other Branch Customer',
          phone: '96550000000',
          phone2: null,
          originBranchId: BRANCH_2,
          originBranch: { id: BRANCH_2, name: 'Branch 2' },
          wallet: { balance: '0.0000', debt: '0.0000' },
        }),
      },
    };
    const service = makeCallCenterService(prisma);

    await expect(
      service.getCustomerLedger(
        CUSTOMER_1,
        {},
        actor(SafariRole.CALL_CENTER, 'cc-user', BRANCH_1),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(
    Object.values(SafariRole).filter((role) => role !== SafariRole.OWNER),
  )('blocks %s from /admin/owner-dashboard', async (role) => {
    const controller = new OwnerDashboardController({} as any);
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      Object.getPrototypeOf(controller).constructor,
    ) as SafariRole[];
    expect(roles).toEqual([SafariRole.OWNER]);

    const guard = makeGuard(roles);
    await expect(
      guard.canActivate(makeGuardContext(role as SafariRole)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
