import type { PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { seedLaundryPriceList } from './laundry-price-list.seed';

const BUSINESS_NAME_AR = 'مجموعة مصابغ سفاري السريعة';
const logger = new Logger('DefaultPriceList');

/**
 * Fresh-install: apply the **same** PDF tariff as `prisma db seed` / Owner UI.
 *
 * Historically this module duplicated 11 legacy rows with conflicting codes
 * (`TROUSERS_SHIRT` vs `TROUSERS`, `BATANYA` vs `BLANKET_ALL`, …) which
 * orphaned categories for Drivers and branch Managers. Empty DBs now load the
 * full canonical list in one shot — identical source as `seedLaundryPriceList`.
 *
 * Field staff (`DRIVER`, `MANAGER`) always read merged prices via
 * `GET /api/laundry-price-list?branchId=<jwt.branchId>`; JWT `branchId` is
 * required for those roles at login time so POS stays tied to the branch tariff.
 */
export async function ensureDefaultPriceList(
  prisma: PrismaClient,
): Promise<void> {
  const existing = await prisma.laundryPriceListItem.count();
  if (existing > 0) {
    return;
  }

  await seedLaundryPriceList(prisma);
  const n = await prisma.laundryPriceListItem.count();
  logger.log(
    `[${BUSINESS_NAME_AR}] Fresh DB — full laundry tariff applied (${n} rows). ` +
      `Drivers/Managers: use branch-scoped JWT for merged catalog.`,
  );
}
