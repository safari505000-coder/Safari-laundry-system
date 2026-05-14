import './load-env-test';
import { execFileSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/safari_erp_test';

function assertSafeIntegrationDatabaseUrl(url: string): void {
  if (!url.includes('safari_erp_test') && !url.includes('localhost')) {
    throw new Error(
      `SAFETY: Refusing to run integration tests against non-test database. URL: ${url.slice(0, 40)}`,
    );
  }
}

assertSafeIntegrationDatabaseUrl(databaseUrl);

process.env.DATABASE_URL = databaseUrl;

const pool = new Pool({ connectionString: databaseUrl });
let closed = false;

export const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

let migrationsApplied = false;

export function runMigrations(): void {
  if (migrationsApplied) {
    return;
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  migrationsApplied = true;
}

export async function resetDb(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('safari_erp_test') && !url.includes('localhost')) {
    throw new Error(
      `SAFETY: Refusing to reset non-test DB. URL: ${url.slice(0, 40)}`,
    );
  }

  await prisma.financialEventDelivery.deleteMany();
  await prisma.financialEventOutbox.deleteMany();
  await prisma.collectionsStageEvent.deleteMany();
  await prisma.promiseEvent.deleteMany();
  await prisma.financialPeriodViolation.deleteMany();
  await prisma.fraudAlert.deleteMany();
  await prisma.journalFailureLog.deleteMany();
  await prisma.journalLine.deleteMany();
  await prisma.commissionPayout.deleteMany();
  await prisma.journalEntry.deleteMany();
  // `GeneralLedgerEntry` is still a first-class model in schema.prisma (read-path / legacy windows).
  await prisma.generalLedgerEntry.deleteMany();
  await prisma.invoiceAuditLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.orderFeedback.deleteMany();
  await prisma.orderLineItem.deleteMany();
  await prisma.transactionHistory.deleteMany();
  await prisma.promiseToPay.deleteMany();
  await prisma.collectionsAccount.deleteMany();
  await prisma.customerCollectionStatus.deleteMany();
  await prisma.financialSnapshot.deleteMany();
  await prisma.customerSubscription.deleteMany();
  await prisma.customerWallet.deleteMany();
  await prisma.order.deleteMany();
  await prisma.posPaymentBundle.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.financialPeriod.deleteMany();
  await prisma.account.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.branch.deleteMany();
}

export async function closeDb(): Promise<void> {
  if (closed) {
    return;
  }
  await prisma.$disconnect();
  await pool.end();
  closed = true;
}

beforeAll(async () => {
  runMigrations();
  await prisma.$connect();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});
