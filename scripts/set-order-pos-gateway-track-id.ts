/**
 * One-off: set `Order.posGatewayTrackId` for recheck (UPayments inquiry).
 * Get the track id from the UPayments merchant panel, payment link query string,
 * or the `/api/v1/charge` response body (`trackId` / `TrackID` / etc.).
 *
 * Usage:
 *   npx tsx scripts/set-order-pos-gateway-track-id.ts 37189224 <trackId>
 *   npx tsx scripts/set-order-pos-gateway-track-id.ts <order-uuid> <trackId>
 *
 * Requires DATABASE_URL (e.g. production in Render env or local .env).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const key = process.argv[2]?.trim();
  const trackId = process.argv[3]?.trim();
  if (!key || !trackId) {
    console.error(
      'Usage: npx tsx scripts/set-order-pos-gateway-track-id.ts <invoiceNumber|orderUUID> <trackId>',
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const order = uuidRe.test(key)
    ? await prisma.order.findUnique({
        where: { id: key },
        select: {
          id: true,
          invoiceNumber: true,
          posGatewayTrackId: true,
          posGatewayMetadata: true,
        },
      })
    : await prisma.order.findFirst({
        where: { invoiceNumber: key },
        select: {
          id: true,
          invoiceNumber: true,
          posGatewayTrackId: true,
          posGatewayMetadata: true,
        },
        orderBy: { createdAt: 'desc' },
      });

  if (!order) {
    console.error(`No order found for: ${key}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const prevMeta =
    order.posGatewayMetadata && typeof order.posGatewayMetadata === 'object'
      ? (order.posGatewayMetadata as Record<string, unknown>)
      : {};
  await prisma.order.update({
    where: { id: order.id },
    data: {
      posGatewayTrackId: trackId,
      posGatewayMetadata: {
        ...prevMeta,
        manualTrackIdRepair: {
          at: new Date().toISOString(),
          invoiceOrKey: key,
          previousTrackId: order.posGatewayTrackId ?? null,
        },
      },
    },
  });

  const after = await prisma.order.findUnique({
    where: { id: order.id },
    select: { posGatewayTrackId: true, invoiceNumber: true },
  });

  console.log('Updated order:', {
    id: order.id,
    invoiceNumber: after?.invoiceNumber ?? null,
    posGatewayTrackId: after?.posGatewayTrackId ?? null,
  });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
