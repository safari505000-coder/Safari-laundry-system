import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

const CATEGORIES: Array<{
  code: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
}> = [
  { code: 'GARMENTS', nameAr: 'ملابس', nameEn: 'Garments', sortOrder: 10 },
  {
    code: 'ACCESSORIES',
    nameAr: 'إكسسوارات',
    nameEn: 'Accessories',
    sortOrder: 20,
  },
  { code: 'HOME', nameAr: 'منسوجات منزلية', nameEn: 'Home textiles', sortOrder: 30 },
  {
    code: 'SERVICES',
    nameAr: 'خدمات ورسوم',
    nameEn: 'Services & fees',
    sortOrder: 40,
  },
];

type Row = {
  code: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
  categoryCode: string;
  manualEntry?: boolean;
  priceNormal: string;
  priceUrgent: string;
  pricePressOnly?: string | null;
  priceUrgentPress?: string | null;
};

const ROWS: Row[] = [
  {
    code: 'COAT',
    nameAr: 'بالطو',
    nameEn: 'Coat',
    sortOrder: 10,
    categoryCode: 'GARMENTS',
    priceNormal: '2.5000',
    priceUrgent: '3.0000',
    pricePressOnly: '0.7500',
    priceUrgentPress: '1.0000',
  },
  {
    code: 'JACKET',
    nameAr: 'جاكيت',
    nameEn: 'Jacket',
    sortOrder: 20,
    categoryCode: 'GARMENTS',
    priceNormal: '1.7500',
    priceUrgent: '2.0000',
    pricePressOnly: '0.5000',
    priceUrgentPress: '0.7500',
  },
  {
    code: 'DISHDASHA_ORD',
    nameAr: 'دشداشة عادي',
    nameEn: 'Dishdasha (ordinary)',
    sortOrder: 30,
    categoryCode: 'GARMENTS',
    priceNormal: '0.6000',
    priceUrgent: '1.0000',
    pricePressOnly: '0.3500',
    priceUrgentPress: '0.5000',
  },
  {
    code: 'DISHDASHA_WOOL',
    nameAr: 'دشداشة صوف',
    nameEn: 'Dishdasha (wool)',
    sortOrder: 40,
    categoryCode: 'GARMENTS',
    priceNormal: '0.7500',
    priceUrgent: '1.0000',
    pricePressOnly: '0.4000',
    priceUrgentPress: '0.5000',
  },
  {
    code: 'GHUTRA_SHEMAGH',
    nameAr: 'غترة/شماغ',
    nameEn: 'Ghutra / Shemagh',
    sortOrder: 50,
    categoryCode: 'ACCESSORIES',
    priceNormal: '0.4000',
    priceUrgent: '0.5000',
    pricePressOnly: '0.2500',
    priceUrgentPress: '0.3500',
  },
  {
    code: 'SUIT_FULL',
    nameAr: 'بدلة كاملة',
    nameEn: 'Full suit',
    sortOrder: 60,
    categoryCode: 'GARMENTS',
    priceNormal: '2.2500',
    priceUrgent: '3.0000',
    pricePressOnly: '0.7500',
    priceUrgentPress: '1.0000',
  },
  {
    code: 'BISHT_OCCASION',
    nameAr: 'بشت مناسبات',
    nameEn: 'Occasion bisht',
    sortOrder: 70,
    categoryCode: 'ACCESSORIES',
    priceNormal: '4.0000',
    priceUrgent: '5.0000',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'BLANKET_ALL',
    nameAr: 'بطانية جميع الأحجام',
    nameEn: 'Blanket (all sizes)',
    sortOrder: 80,
    categoryCode: 'HOME',
    priceNormal: '1.7500',
    priceUrgent: '3.0000',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'DYPAJ_ALL',
    nameAr: 'ديباج جميع الأحجام',
    nameEn: 'Dypaj (all sizes)',
    sortOrder: 90,
    categoryCode: 'HOME',
    priceNormal: '2.5000',
    priceUrgent: '4.5000',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'ABAYA',
    nameAr: 'عباءة',
    nameEn: 'Abaya',
    sortOrder: 100,
    categoryCode: 'GARMENTS',
    priceNormal: '1.2500',
    priceUrgent: '1.5000',
    pricePressOnly: '0.5000',
    priceUrgentPress: '0.7500',
  },
  {
    code: 'DELIVERY_INSIDE_AREA',
    nameAr: 'توصيل داخل المنطقة',
    nameEn: 'Delivery inside area',
    sortOrder: 110,
    categoryCode: 'SERVICES',
    priceNormal: '0.2500',
    priceUrgent: '0.2500',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'DELIVERY_OUTSIDE_AREA',
    nameAr: 'توصيل خارج المنطقة',
    nameEn: 'Delivery outside area',
    sortOrder: 120,
    categoryCode: 'SERVICES',
    priceNormal: '0.5000',
    priceUrgent: '0.5000',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'VIP_SERVICE',
    nameAr: 'خدمة كبار الشخصيات',
    nameEn: 'VIP Service',
    sortOrder: 130,
    categoryCode: 'SERVICES',
    priceNormal: '1.0000',
    priceUrgent: '1.0000',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
];

export async function seedLaundryPriceList(
  prisma: PrismaClient,
): Promise<void> {
  const catIds = new Map<string, string>();
  for (const c of CATEGORIES) {
    const row = await prisma.laundryItemCategory.upsert({
      where: { code: c.code },
      create: {
        id: randomUUID(),
        code: c.code,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        sortOrder: c.sortOrder,
      },
      update: {
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        sortOrder: c.sortOrder,
      },
    });
    catIds.set(c.code, row.id);
  }

  await prisma.laundryPriceListItem.deleteMany({
    where: {
      code: {
        notIn: ROWS.map((row) => row.code),
      },
    },
  });

  for (const row of ROWS) {
    const categoryId = catIds.get(row.categoryCode) ?? null;
    await prisma.laundryPriceListItem.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        nameAr: row.nameAr,
        nameEn: row.nameEn,
        sortOrder: row.sortOrder,
        manualEntry: row.manualEntry ?? false,
        categoryId,
        priceNormal: new Prisma.Decimal(row.priceNormal),
        priceUrgent: new Prisma.Decimal(row.priceUrgent),
        pricePressOnly:
          row.pricePressOnly != null ?
            new Prisma.Decimal(row.pricePressOnly)
          : null,
        priceUrgentPress:
          row.priceUrgentPress != null ?
            new Prisma.Decimal(row.priceUrgentPress)
          : null,
      },
      update: {
        nameAr: row.nameAr,
        nameEn: row.nameEn,
        sortOrder: row.sortOrder,
        manualEntry: row.manualEntry ?? false,
        categoryId,
        priceNormal: new Prisma.Decimal(row.priceNormal),
        priceUrgent: new Prisma.Decimal(row.priceUrgent),
        pricePressOnly:
          row.pricePressOnly != null ?
            new Prisma.Decimal(row.pricePressOnly)
          : null,
        priceUrgentPress:
          row.priceUrgentPress != null ?
            new Prisma.Decimal(row.priceUrgentPress)
          : null,
      },
    });
  }
}
