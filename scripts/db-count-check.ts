import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.log('NO_DATABASE_URL');
    process.exit(1);
  }

  let host = 'unknown';
  try {
    host = new URL(url).hostname;
  } catch {
    // ignore
  }

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const counts = {
    User: await prisma.user.count(),
    Customer: await prisma.customer.count(),
    Branch: await prisma.branch.count(),
    Order: await prisma.order.count(),
    OrderLineItem: await prisma.orderLineItem.count(),
    JournalEntry: await prisma.journalEntry.count(),
    JournalLine: await prisma.journalLine.count(),
    TransactionHistory: await prisma.transactionHistory.count(),
    CustomerWallet: await prisma.customerWallet.count(),
    CustomerSubscription: await prisma.customerSubscription.count(),
    LaundryPriceListItem: await prisma.laundryPriceListItem.count(),
    WebsiteOrderRequest: await prisma.websiteOrderRequest.count(),
    Dispatch: await prisma.dispatch.count(),
    Shift: await prisma.shift.count(),
  };

  console.log(`DB_HOST=${host}`);
  for (const [table, count] of Object.entries(counts)) {
    console.log(`${table}=${count}`);
  }

  const branches = await prisma.branch.findMany({ select: { name: true } });
  const customers = await prisma.customer.findMany({
    select: { displayName: true, phone: true, isBlocked: true },
  });
  const wallets = await prisma.customerWallet.findMany({
    select: { balance: true, debt: true },
  });

  console.log('---');
  console.log(`Branches: ${branches.map((b) => b.name).join(' | ') || '(none)'}`);
  console.log(`Customers: ${customers.length}`);
  for (const c of customers) {
    console.log(`  - ${c.displayName ?? '(no name)'} | ${c.phone} | blocked=${c.isBlocked}`);
  }
  for (const w of wallets) {
    console.log(`  wallet balance=${w.balance} debt=${w.debt}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

void main();
