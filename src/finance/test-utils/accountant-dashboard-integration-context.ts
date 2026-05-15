/**
 * Accountant dashboard integration tests — PostgreSQL + real Prisma adapter.
 *
 * Set `ACCOUNTANT_DASHBOARD_TEST_DATABASE_URL` to a disposable database
 * (migrate + empty or dedicated). SQLite is not supported for this schema.
 */
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  CashStatus,
  ExpenseCategory,
  ExpenseStatus,
  ManagerCashCustodyStatus,
  OrderStatus,
  PosPaymentMethod,
  PrismaClient,
  SafariRole,
} from '@prisma/client';
import { Pool } from 'pg';

export type AccountantDashboardTestContext = {
  prisma: PrismaClient;
  pool: Pool;
  runId: string;
  branchId: string;
  managerId: string;
  driverAId: string;
  driverBId: string;
  customerId: string;
  accountantId: string;
  dispose: () => Promise<void>;
};

function requireTestDbUrl(): string {
  const url = process.env.ACCOUNTANT_DASHBOARD_TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'Set ACCOUNTANT_DASHBOARD_TEST_DATABASE_URL to run accountant dashboard integration tests.',
    );
  }
  return url;
}

async function upsertRole(prisma: PrismaClient, role: SafariRole) {
  return prisma.role.upsert({
    where: { name: role },
    create: { name: role },
    update: {},
  });
}

export async function createAccountantDashboardTestContext(): Promise<AccountantDashboardTestContext> {
  const url = requireTestDbUrl();
  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  await prisma.$connect();

  const runId = randomUUID().slice(0, 8);
  const suffix = `acct-${runId}`;
  const hash = await bcrypt.hash('test-pass', 4);

  const [driverRole, managerRole, accountantRole] = await Promise.all([
    upsertRole(prisma, SafariRole.DRIVER),
    upsertRole(prisma, SafariRole.MANAGER),
    upsertRole(prisma, SafariRole.ACCOUNTANT),
  ]);

  const branch = await prisma.branch.create({
    data: {
      name: `Branch ${suffix}`,
      location: 'Test',
      phone: `90000${runId.slice(0, 4)}`,
    },
  });

  const driverA = await prisma.user.create({
    data: {
      username: `${suffix}-drv-a`,
      password: hash,
      fullName: 'Driver A Integration',
      safariRole: SafariRole.DRIVER,
      roleId: driverRole.id,
      branchId: branch.id,
    },
  });
  const driverB = await prisma.user.create({
    data: {
      username: `${suffix}-drv-b`,
      password: hash,
      fullName: 'Driver B Integration',
      safariRole: SafariRole.DRIVER,
      roleId: driverRole.id,
      branchId: branch.id,
    },
  });
  const manager = await prisma.user.create({
    data: {
      username: `${suffix}-mgr`,
      password: hash,
      fullName: 'Manager Integration',
      safariRole: SafariRole.MANAGER,
      roleId: managerRole.id,
      branchId: branch.id,
    },
  });
  const accountant = await prisma.user.create({
    data: {
      username: `${suffix}-acct`,
      password: hash,
      fullName: 'Accountant Integration',
      safariRole: SafariRole.ACCOUNTANT,
      roleId: accountantRole.id,
      branchId: branch.id,
    },
  });

  const customer = await prisma.customer.create({
    data: {
      phone: `50000${runId.slice(0, 5)}`,
      displayName: `Cust ${suffix}`,
      originBranchId: branch.id,
    },
  });

  const ctx: AccountantDashboardTestContext = {
    prisma,
    pool,
    runId,
    branchId: branch.id,
    managerId: manager.id,
    driverAId: driverA.id,
    driverBId: driverB.id,
    customerId: customer.id,
    accountantId: accountant.id,
    dispose: async () => {
      const orders = await prisma.order.findMany({
        where: { customerId: customer.id },
        select: { id: true },
      });
      const oids = orders.map((o) => o.id);
      if (oids.length > 0) {
        await prisma.generalLedgerEntry.deleteMany({
          where: { orderId: { in: oids } },
        });
      }
      await prisma.order.deleteMany({
        where: { customerId: customer.id },
      });
      await prisma.branchExpense.deleteMany({
        where: { branchId: branch.id },
      });
      await prisma.managerCashCustody.deleteMany({
        where: { branchId: branch.id },
      });
      await prisma.customer.delete({ where: { id: customer.id } }).catch(() => undefined);
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [driverA.id, driverB.id, manager.id, accountant.id],
          },
        },
      });
      await prisma.branch.delete({ where: { id: branch.id } }).catch(() => undefined);
      await prisma.$disconnect();
      await pool.end();
    },
  };

  return ctx;
}

export type CashOrderParams = {
  driverId: string | null;
  totalPrice: string;
  completedAt: Date;
  cashStatus?: CashStatus;
};

export async function insertCompletedCashOrder(
  ctx: AccountantDashboardTestContext,
  p: CashOrderParams,
): Promise<string> {
  const order = await ctx.prisma.order.create({
    data: {
      customerId: ctx.customerId,
      driverId: p.driverId,
      status: OrderStatus.COMPLETED,
      posPaymentMethod: PosPaymentMethod.CASH,
      cashStatus: p.cashStatus ?? CashStatus.PAID_TO_DRIVER,
      totalPrice: p.totalPrice,
      completedAt: p.completedAt,
    },
  });
  return order.id;
}

export async function insertCustodyHandover(
  ctx: AccountantDashboardTestContext,
  p: {
    driverId: string;
    amountKd: string;
    receivedFromDriverAt: Date;
    status?: ManagerCashCustodyStatus;
    slipUploadedAt?: Date | null;
  },
): Promise<string> {
  const row = await ctx.prisma.managerCashCustody.create({
    data: {
      managerId: ctx.managerId,
      driverId: p.driverId,
      branchId: ctx.branchId,
      amountKd: p.amountKd,
      status: p.status ?? ManagerCashCustodyStatus.PENDING_DEPOSIT,
      receivedFromDriverAt: p.receivedFromDriverAt,
      slipUploadedAt: p.slipUploadedAt ?? undefined,
    },
  });
  return row.id;
}

export async function insertApprovedExpense(
  ctx: AccountantDashboardTestContext,
  p: { amount: string; expenseDate: Date },
): Promise<void> {
  await ctx.prisma.branchExpense.create({
    data: {
      title: `Expense ${ctx.runId}`,
      amount: p.amount,
      category: ExpenseCategory.MISC,
      status: ExpenseStatus.APPROVED,
      recordedById: ctx.accountantId,
      branchId: ctx.branchId,
      expenseDate: p.expenseDate,
    },
  });
}
