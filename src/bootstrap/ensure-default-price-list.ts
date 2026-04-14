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

export async function ensureDefaultPriceList(
  prisma: PrismaClient,
): Promise<void> {
  const codes = DEFAULT_PRICE_ITEMS.map((item) => item.code);
  await prisma.laundryPriceListItem.deleteMany({
    where: { code: { notIn: codes } },
  });

  for (const [index, item] of DEFAULT_PRICE_ITEMS.entries()) {
    await prisma.laundryPriceListItem.upsert({
      where: { code: item.code },
      create: {
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
      update: {
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
    `[${BUSINESS_NAME_AR}] Default laundry price list ensured (${DEFAULT_PRICE_ITEMS.length} items).`,
  );
}
