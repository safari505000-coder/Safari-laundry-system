import type { PrismaClient } from '@prisma/client';

export const BUSINESS_NAME_AR = 'مجموعة مصابغ سفاري السريعة';

export type DefaultPriceItem = {
  code: string;
  nameAr: string;
  nameEn: string;
  priceNormal: number;
  priceUrgent: number;
  pricePressOnly: number | null;
  priceUrgentPress: number | null;
};

export const DEFAULT_PRICE_ITEMS: readonly DefaultPriceItem[] = [
  {
    code: 'OVER_COAT',
    nameAr: 'بالطو',
    nameEn: 'Over Coat',
    priceNormal: 2.5,
    priceUrgent: 3.0,
    pricePressOnly: 0.75,
    priceUrgentPress: 1.0,
  },
  {
    code: 'JACKET',
    nameAr: 'جاكيت',
    nameEn: 'Jacket',
    priceNormal: 1.75,
    priceUrgent: 2.0,
    pricePressOnly: 0.5,
    priceUrgentPress: 0.75,
  },
  {
    code: 'TROUSERS_SHIRT',
    nameAr: 'بنطلون/قميص',
    nameEn: 'Trousers / Shirt',
    priceNormal: 0.5,
    priceUrgent: 0.75,
    pricePressOnly: 0.25,
    priceUrgentPress: 0.35,
  },
  {
    code: 'SUIT',
    nameAr: 'بدلة كاملة',
    nameEn: 'Suit',
    priceNormal: 2.25,
    priceUrgent: 3.0,
    pricePressOnly: 0.75,
    priceUrgentPress: 1.0,
  },
  {
    code: 'DISHDASHA_ORD',
    nameAr: 'دشداشة عادي',
    nameEn: 'Dishdasha Ord',
    priceNormal: 0.6,
    priceUrgent: 1.0,
    pricePressOnly: 0.35,
    priceUrgentPress: 0.5,
  },
  {
    code: 'DISHDASHA_WOOL',
    nameAr: 'دشداشة صوف',
    nameEn: 'Dishdasha Wool',
    priceNormal: 0.75,
    priceUrgent: 1.0,
    pricePressOnly: 0.4,
    priceUrgentPress: 0.5,
  },
  {
    code: 'GHOTRA',
    nameAr: 'غترة/شماغ',
    nameEn: 'Ghotra / Shemagh',
    priceNormal: 0.4,
    priceUrgent: 0.5,
    pricePressOnly: 0.25,
    priceUrgentPress: 0.35,
  },
  {
    code: 'OCCASION_BISHT',
    nameAr: 'بشت مناسبات',
    nameEn: 'Occasion Bisht',
    priceNormal: 4.0,
    priceUrgent: 5.0,
    pricePressOnly: 1.0,
    priceUrgentPress: 1.5,
  },
  {
    code: 'ABAYA',
    nameAr: 'عباءة',
    nameEn: 'Abaya',
    priceNormal: 1.25,
    priceUrgent: 1.5,
    pricePressOnly: 0.5,
    priceUrgentPress: 0.75,
  },
  {
    code: 'BATANYA',
    nameAr: 'بطانية',
    nameEn: 'Batanya',
    priceNormal: 1.75,
    priceUrgent: 3.0,
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'COVER',
    nameAr: 'ديباج',
    nameEn: 'Cover',
    priceNormal: 2.5,
    priceUrgent: 4.5,
    pricePressOnly: null,
    priceUrgentPress: null,
  },
];

/**
 * Fresh-install safety net.
 *
 * Historically this function was the ONLY place that populated
 * `LaundryPriceListItem`, so it both inserted the bundled defaults AND
 * deleted anything else to keep the table in lock-step with its own
 * 11-row list.
 *
 * Since V19.10 the master tariff (41 rows, 8 categories) lives in
 * `prisma/price-list-seed.ts::seedLaundryPriceList` and is the one and
 * only source of truth. Running both in parallel caused a destructive
 * race where every backend boot would silently shrink the DB back down
 * to the 11 baseline codes (and, because the baseline uses different
 * codes like `TROUSERS_SHIRT` vs the tariff's `TROUSERS`, orphaning
 * half of them with no category).
 *
 * New behaviour: this function only seeds when the price-list table is
 * completely empty (brand-new DB / CI container). Once `seedLaundryPriceList`
 * has run, or an Owner has populated the table any other way, we return
 * immediately so no rows are touched.
 */
export async function ensureDefaultPriceList(
  prisma: PrismaClient,
): Promise<void> {
  const existing = await prisma.laundryPriceListItem.count();
  if (existing > 0) {
    return;
  }

  for (const [index, item] of DEFAULT_PRICE_ITEMS.entries()) {
    await prisma.laundryPriceListItem.create({
      data: {
        code: item.code,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        sortOrder: index + 1,
        manualEntry: false,
        priceNormal: item.priceNormal,
        priceUrgent: item.priceUrgent,
        pricePressOnly: item.pricePressOnly,
        priceUrgentPress: item.priceUrgentPress,
      },
    });
  }

  console.log(
    `[${BUSINESS_NAME_AR}] Fresh DB detected — bootstrap seed inserted ${DEFAULT_PRICE_ITEMS.length} baseline items. Run 'npm run db:seed' for the full V19.10 tariff.`,
  );
}
