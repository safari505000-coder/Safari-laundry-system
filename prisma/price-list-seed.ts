import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

/**
 * Safari Fast Group — MASTER price list seed (Constitution V5.2, V19.10
 * category refresh).
 *
 * Source of truth = the official printed tariff PDF. The seed is idempotent
 * and is invoked on every `prisma db seed` (which fires automatically via
 * `npm start`). On each run:
 *   1. The eight categories below are upserted by `code`. The V19.10 rework
 *      splits the legacy "JACKETS_BISHT" / "MISC" buckets into narrower
 *      groups that mirror the printed tariff's visual flow (everyday men's
 *      items → national dress → small accessories → household linens →
 *      formal occasion wear → ladies' wear → unisex → extras).
 *   2. Every tariff row is upserted by `code`. Prices are stored with up to
 *      4-decimal precision; the POS / Driver UIs always render 3-decimal KWD.
 *   3. Any item whose `code` is NOT listed here is deleted (this is how
 *      legacy codes like DELIVERY_*, SHIRT_TROUSERS, SHEETS_LIGHT and any
 *      one-off hand-added rows are purged). Historical `OrderLineItem`
 *      rows snapshot their own `label` string, so they survive unchanged.
 *   4. Any category whose `code` is NOT listed here is deleted; items have
 *      already been reparented above, and `LaundryPriceListItem.categoryId`
 *      uses ON DELETE SET NULL, so nothing can break. Legacy codes removed
 *      on this pass: MENS, JACKETS_BISHT, MISC (contents redistributed).
 *
 * Pricing grid (maps PDF columns → schema columns):
 *   priceNormal      ← Wash+Iron  / Wash
 *   priceUrgent      ← Exp Wash+Iron / Exp Wash
 *   pricePressOnly   ← Iron-only                    (null for wash-only rows)
 *   priceUrgentPress ← Exp Iron-only                (null for wash-only rows)
 *
 * `manualEntry: true` is set for "Quote Based Pricing" rows (Ladies Dress,
 * Parda). Their price tiers are 0.0000 so the POS knows to prompt the staff.
 */

const CATEGORIES: Array<{
  code: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
}> = [
  {
    code: 'MENS_ESSENTIALS',
    nameAr: 'ملابس رجالية أساسية',
    nameEn: "Men's Essentials",
    sortOrder: 10,
  },
  {
    code: 'MENS_NATIONAL',
    nameAr: 'الزي الوطني الرجالي',
    nameEn: 'National Dress (Men)',
    sortOrder: 20,
  },
  {
    code: 'ACCESSORIES_SMALL',
    nameAr: 'إكسسوارات وقطع صغيرة',
    nameEn: 'Small Accessories',
    sortOrder: 30,
  },
  {
    code: 'HOUSEHOLD_LINENS',
    nameAr: 'المفروشات والبياضات',
    nameEn: 'Household & Linens',
    sortOrder: 40,
  },
  {
    code: 'FORMAL_WEAR',
    nameAr: 'ملابس رسمية وبشوت',
    nameEn: 'Formal Wear & Bisht',
    sortOrder: 50,
  },
  {
    code: 'LADIES',
    nameAr: 'ملابس نسائية',
    nameEn: "Ladies' Wear",
    sortOrder: 60,
  },
  {
    code: 'UNISEX',
    nameAr: 'ملابس متعددة الاستخدام',
    nameEn: 'Unisex',
    sortOrder: 70,
  },
  {
    code: 'SERVICES',
    nameAr: 'خدمات إضافية',
    nameEn: 'Extras',
    sortOrder: 80,
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
  // ──────────────────────────────────────────────────────────────────────────
  // ١. MEN'S ESSENTIALS — everyday outerwear, suits, and shirt/trouser combos
  //    (matches the top block of the printed tariff photo)
  // ──────────────────────────────────────────────────────────────────────────
  {
    code: 'OVER_COAT',
    nameAr: 'بالطو',
    nameEn: 'Over Coat',
    sortOrder: 10,
    categoryCode: 'MENS_ESSENTIALS',
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
    categoryCode: 'MENS_ESSENTIALS',
    priceNormal: '1.7500',
    priceUrgent: '2.0000',
    pricePressOnly: '0.5000',
    priceUrgentPress: '0.7500',
  },
  {
    code: 'JACKET_SNAP_ON',
    nameAr: 'جاكيت بكبوس',
    nameEn: 'Snap-on Jacket',
    sortOrder: 30,
    categoryCode: 'MENS_ESSENTIALS',
    priceNormal: '1.0000',
    priceUrgent: '1.5000',
    pricePressOnly: '0.5000',
    priceUrgentPress: '0.7500',
  },
  {
    code: 'TROUSERS',
    nameAr: 'بنطلون',
    nameEn: 'Trousers',
    sortOrder: 40,
    categoryCode: 'MENS_ESSENTIALS',
    priceNormal: '0.5000',
    priceUrgent: '0.7500',
    pricePressOnly: '0.2500',
    priceUrgentPress: '0.3500',
  },
  {
    code: 'SHIRT',
    nameAr: 'قميص',
    nameEn: 'Shirt',
    sortOrder: 50,
    categoryCode: 'MENS_ESSENTIALS',
    priceNormal: '0.5000',
    priceUrgent: '0.7500',
    pricePressOnly: '0.2500',
    priceUrgentPress: '0.3500',
  },
  {
    code: 'SUIT_FULL',
    nameAr: 'بدلة كاملة',
    nameEn: 'Suit',
    sortOrder: 60,
    categoryCode: 'MENS_ESSENTIALS',
    priceNormal: '2.2500',
    priceUrgent: '3.0000',
    pricePressOnly: '0.7500',
    priceUrgentPress: '1.0000',
  },
  {
    code: 'MILITARY_SUIT_2PC',
    nameAr: 'بدلة عسكرية',
    nameEn: 'Military suit (2pc)',
    sortOrder: 70,
    categoryCode: 'MENS_ESSENTIALS',
    priceNormal: '1.0000',
    priceUrgent: '1.5000',
    pricePressOnly: '0.5000',
    priceUrgentPress: '0.7500',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ٢. MEN'S NATIONAL DRESS — Kuwaiti dishdasha + gotra variants
  // ──────────────────────────────────────────────────────────────────────────
  {
    code: 'DISHDASHA_WOOL',
    nameAr: 'دشداشة صوف',
    nameEn: 'Dishdasha (wool)',
    sortOrder: 80,
    categoryCode: 'MENS_NATIONAL',
    priceNormal: '0.7500',
    priceUrgent: '1.0000',
    pricePressOnly: '0.4000',
    priceUrgentPress: '0.5000',
  },
  {
    code: 'DISHDASHA_ORD',
    nameAr: 'دشداشة عادي',
    nameEn: 'Dishdasha (ordinary)',
    sortOrder: 90,
    categoryCode: 'MENS_NATIONAL',
    priceNormal: '0.6000',
    priceUrgent: '1.0000',
    pricePressOnly: '0.3500',
    priceUrgentPress: '0.5000',
  },
  {
    code: 'GOTRA',
    nameAr: 'غترة شماغ',
    nameEn: 'Gotra',
    sortOrder: 100,
    categoryCode: 'MENS_NATIONAL',
    priceNormal: '0.4000',
    priceUrgent: '0.5000',
    pricePressOnly: '0.2500',
    priceUrgentPress: '0.3500',
  },
  {
    code: 'GOTRA_WHITE',
    nameAr: 'غترة بيضاء',
    nameEn: 'White Gotra',
    sortOrder: 110,
    categoryCode: 'MENS_NATIONAL',
    priceNormal: '0.4000',
    priceUrgent: '0.5000',
    pricePressOnly: '0.2500',
    priceUrgentPress: '0.3500',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ٣. SMALL ACCESSORIES — inner layers, socks, caps (everything tiny enough
  //    to not sit neatly in any other bucket)
  // ──────────────────────────────────────────────────────────────────────────
  {
    // Press tiers intentionally 0.0000 (explicitly listed by the tariff as
    // zero — NOT null) so they appear as "no-cost press" line-items rather
    // than hidden tiers.
    code: 'SYRUP',
    nameAr: 'شراب/دلاق',
    nameEn: 'Syrup (Socks)',
    sortOrder: 120,
    categoryCode: 'ACCESSORIES_SMALL',
    priceNormal: '0.1000',
    priceUrgent: '0.2000',
    pricePressOnly: '0.0000',
    priceUrgentPress: '0.0000',
  },
  {
    code: 'INSIDE_CLOTHES',
    nameAr: 'ملابس داخلية',
    nameEn: 'Inside Clothes',
    sortOrder: 130,
    categoryCode: 'ACCESSORIES_SMALL',
    priceNormal: '0.3000',
    priceUrgent: '0.4000',
    pricePressOnly: '0.2000',
    priceUrgentPress: '0.3000',
  },
  {
    code: 'TAQIYA',
    nameAr: 'طاقية',
    nameEn: 'Taqiya',
    sortOrder: 140,
    categoryCode: 'ACCESSORIES_SMALL',
    priceNormal: '0.1000',
    priceUrgent: '0.1500',
    pricePressOnly: '0.5000',
    priceUrgentPress: '0.1000',
  },
  {
    code: 'KABB',
    nameAr: 'كاب',
    nameEn: 'Kabb',
    sortOrder: 150,
    categoryCode: 'ACCESSORIES_SMALL',
    priceNormal: '0.2500',
    priceUrgent: '0.3500',
    pricePressOnly: '0.1000',
    priceUrgentPress: '0.1500',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ٤. HOUSEHOLD & LINENS — bedding, towels, curtains
  // ──────────────────────────────────────────────────────────────────────────
  {
    code: 'FITTED_SHEET',
    nameAr: 'شرشف سميك',
    nameEn: 'Fitted Sheet',
    sortOrder: 160,
    categoryCode: 'HOUSEHOLD_LINENS',
    priceNormal: '1.0000',
    priceUrgent: '1.5000',
    pricePressOnly: '0.5000',
    priceUrgentPress: '0.7500',
  },
  {
    // Wash-only tariff: press tiers null per PDF.
    code: 'BLANKET_ALL',
    nameAr: 'بطانية جميع الأحجام',
    nameEn: 'Batanya (Blanket)',
    sortOrder: 170,
    categoryCode: 'HOUSEHOLD_LINENS',
    priceNormal: '1.7500',
    priceUrgent: '3.0000',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'COVER_DEBAJ',
    nameAr: 'ديباج جميع الأحجام',
    nameEn: 'Cover (Debaj)',
    sortOrder: 180,
    categoryCode: 'HOUSEHOLD_LINENS',
    priceNormal: '2.5000',
    priceUrgent: '4.5000',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'HOTEL_MATTRESS',
    nameAr: 'فرشة فندقية',
    nameEn: 'Hotel Mattress',
    sortOrder: 190,
    categoryCode: 'HOUSEHOLD_LINENS',
    priceNormal: '4.0000',
    priceUrgent: '6.0000',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'SLIP',
    nameAr: 'سليب باق',
    nameEn: 'Slip',
    sortOrder: 200,
    categoryCode: 'HOUSEHOLD_LINENS',
    priceNormal: '0.5000',
    priceUrgent: '0.7500',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'PILLOW',
    nameAr: 'مخدة',
    nameEn: 'Pillow',
    sortOrder: 210,
    categoryCode: 'HOUSEHOLD_LINENS',
    priceNormal: '0.5000',
    priceUrgent: '0.7500',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'LIGHT_SHEET',
    nameAr: 'شرشف خفيف',
    nameEn: 'Light Sheet',
    sortOrder: 220,
    categoryCode: 'HOUSEHOLD_LINENS',
    priceNormal: '0.5000',
    priceUrgent: '0.7500',
    pricePressOnly: '0.2500',
    priceUrgentPress: '0.3500',
  },
  {
    code: 'BATH_SHEET',
    nameAr: 'بشكير حمام',
    nameEn: 'Bath Sheet',
    sortOrder: 230,
    categoryCode: 'HOUSEHOLD_LINENS',
    priceNormal: '0.5000',
    priceUrgent: '0.7500',
    pricePressOnly: '0.3500',
    priceUrgentPress: '0.4500',
  },
  {
    code: 'PILLOW_CASE',
    nameAr: 'وجه مخدة',
    nameEn: 'Pillow Case',
    sortOrder: 240,
    categoryCode: 'HOUSEHOLD_LINENS',
    priceNormal: '0.2500',
    priceUrgent: '0.5000',
    pricePressOnly: '0.1500',
    priceUrgentPress: '0.2000',
  },
  {
    // Quote-based — manualEntry=true (see LADIES_DRESS note below).
    code: 'PARDA',
    nameAr: 'باردا بجميع أنواعها',
    nameEn: 'Parda (Curtains)',
    sortOrder: 250,
    categoryCode: 'HOUSEHOLD_LINENS',
    manualEntry: true,
    priceNormal: '0.0000',
    priceUrgent: '0.0000',
    pricePressOnly: null,
    priceUrgentPress: null,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ٥. FORMAL WEAR & BISHT — ceremonial / occasion garments (bisht + abaya
  //    family). Kept distinct from day-to-day ladies' wear for accounting
  //    reports and for the POS "occasion pricing" filter.
  // ──────────────────────────────────────────────────────────────────────────
  {
    code: 'BISHT_OCCASION',
    nameAr: 'بشت مناسبات',
    nameEn: 'Occasion Bisht',
    sortOrder: 260,
    categoryCode: 'FORMAL_WEAR',
    priceNormal: '4.0000',
    priceUrgent: '5.0000',
    pricePressOnly: '1.0000',
    priceUrgentPress: '1.5000',
  },
  {
    code: 'BISHT_DANDER',
    nameAr: 'بشت وبر',
    nameEn: 'Dander Bisht',
    sortOrder: 270,
    categoryCode: 'FORMAL_WEAR',
    priceNormal: '3.5000',
    priceUrgent: '4.5000',
    pricePressOnly: '2.0000',
    priceUrgentPress: '2.5000',
  },
  {
    code: 'ABAYA',
    nameAr: 'عباءة',
    nameEn: 'Abaya',
    sortOrder: 280,
    categoryCode: 'FORMAL_WEAR',
    priceNormal: '1.2500',
    priceUrgent: '1.5000',
    pricePressOnly: '0.5000',
    priceUrgentPress: '0.7500',
  },
  {
    code: 'CRYSTAL_ABAYA',
    nameAr: 'عباءة مطرز/كريستال',
    nameEn: 'Crystal Abaya',
    sortOrder: 290,
    categoryCode: 'FORMAL_WEAR',
    priceNormal: '3.0000',
    priceUrgent: '3.5000',
    pricePressOnly: '1.5000',
    priceUrgentPress: '2.0000',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ٦. LADIES' WEAR — scarves, tops, skirts, gowns, and the quote-based
  //    occasion dress
  // ──────────────────────────────────────────────────────────────────────────
  {
    code: 'SHEILA',
    nameAr: 'شيلا',
    nameEn: 'Sheila',
    sortOrder: 300,
    categoryCode: 'LADIES',
    priceNormal: '0.3500',
    priceUrgent: '0.5000',
    pricePressOnly: '0.2500',
    priceUrgentPress: '0.3500',
  },
  {
    code: 'SHAWL',
    nameAr: 'شال',
    nameEn: 'Shawl',
    sortOrder: 310,
    categoryCode: 'LADIES',
    priceNormal: '0.5000',
    priceUrgent: '0.7500',
    pricePressOnly: '0.2500',
    priceUrgentPress: '0.3500',
  },
  {
    code: 'SCARVES',
    nameAr: 'طرحة',
    nameEn: 'Scarves',
    sortOrder: 320,
    categoryCode: 'LADIES',
    priceNormal: '0.2500',
    priceUrgent: '0.4000',
    pricePressOnly: '0.1500',
    priceUrgentPress: '0.2500',
  },
  {
    code: 'NIQAB',
    nameAr: 'نقاب',
    nameEn: 'Niqab',
    sortOrder: 330,
    categoryCode: 'LADIES',
    priceNormal: '0.1500',
    priceUrgent: '0.2500',
    pricePressOnly: '0.1000',
    priceUrgentPress: '0.1500',
  },
  {
    code: 'SKIRT',
    nameAr: 'تنورة',
    nameEn: 'Skirt',
    sortOrder: 340,
    categoryCode: 'LADIES',
    priceNormal: '0.5000',
    priceUrgent: '0.7500',
    pricePressOnly: '0.2500',
    priceUrgentPress: '0.3500',
  },
  {
    code: 'BLOUSE',
    nameAr: 'بلوزة',
    nameEn: 'Blouse',
    sortOrder: 350,
    categoryCode: 'LADIES',
    priceNormal: '0.5000',
    priceUrgent: '0.7500',
    pricePressOnly: '0.2500',
    priceUrgentPress: '0.3500',
  },
  {
    code: 'GOWN',
    nameAr: 'قميص نوم',
    nameEn: 'Gown',
    sortOrder: 360,
    categoryCode: 'LADIES',
    priceNormal: '0.5000',
    priceUrgent: '0.7500',
    pricePressOnly: '0.2500',
    priceUrgentPress: '0.3500',
  },
  {
    // Quote-based — manualEntry=true tells POS to prompt the staff for a price
    // at the till. Stored tiers are 0.0000 so any accidental use without a
    // manual override flags as suspicious rather than silently billing zero.
    code: 'LADIES_DRESS',
    nameAr: 'فستان',
    nameEn: 'Ladies Dress',
    sortOrder: 370,
    categoryCode: 'LADIES',
    manualEntry: true,
    priceNormal: '0.0000',
    priceUrgent: '0.0000',
    pricePressOnly: null,
    priceUrgentPress: null,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ٧. UNISEX — garments that legitimately belong to neither men's nor
  //    ladies' buckets (pyjamas, baby clothing)
  // ──────────────────────────────────────────────────────────────────────────
  {
    code: 'PYJAMA',
    nameAr: 'بيجاما',
    nameEn: 'Pyjama',
    sortOrder: 380,
    categoryCode: 'UNISEX',
    priceNormal: '0.7500',
    priceUrgent: '1.0000',
    pricePressOnly: '0.5000',
    priceUrgentPress: '0.7500',
  },
  {
    code: 'BABY_CLOTHES',
    nameAr: 'ملابس بيبي',
    nameEn: 'Baby Clothes',
    sortOrder: 390,
    categoryCode: 'UNISEX',
    priceNormal: '0.4000',
    priceUrgent: '0.5500',
    pricePressOnly: '0.3000',
    priceUrgentPress: '0.3500',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ٨. EXTRAS — flat surcharges (no press tiers; same price on both columns)
  //
  // These two rows are NOT part of the "39 base items" tariff — they are
  // service / fee rows that the POS engine injects on demand:
  //   • VIP_SERVICE          → optional, toggled manually per invoice (+1.000)
  //   • DELIVERY_INSIDE_AREA → mandatory, auto-injected at 0.250 on the first
  //                            invoice of a collection trip and at 0.000
  //                            on every subsequent attached invoice.
  // Outside-area delivery is intentionally NOT seeded (purged per V5.3 spec).
  // ──────────────────────────────────────────────────────────────────────────
  {
    code: 'VIP_SERVICE',
    nameAr: 'خدمة كبار الشخصيات',
    nameEn: 'VIP Service',
    sortOrder: 400,
    categoryCode: 'SERVICES',
    priceNormal: '1.0000',
    priceUrgent: '1.0000',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
  {
    code: 'DELIVERY_INSIDE_AREA',
    nameAr: 'توصيل داخل المنطقة',
    nameEn: 'Delivery (inside area)',
    sortOrder: 410,
    categoryCode: 'SERVICES',
    priceNormal: '0.2500',
    priceUrgent: '0.2500',
    pricePressOnly: null,
    priceUrgentPress: null,
  },
];

export async function seedLaundryPriceList(
  prisma: PrismaClient,
): Promise<void> {
  // 1. Upsert the eight V19.10 categories (idempotent on `code`).
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

  // 2. Upsert the canonical tariff rows BEFORE any delete — items that
  //    previously belonged to legacy categories get reparented first, so
  //    the category cleanup in step 4 cannot orphan anything.
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
        // Re-activate on every seed — if an Owner hid a master row then
        // the tariff was re-issued, the row should reappear in POS.
        isActive: true,
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

  // 3. Remove any item whose code is no longer in the master tariff.
  //    Purges legacy rows (DELIVERY_*, SHIRT_TROUSERS, SHEETS_LIGHT, …) and
  //    any hand-added rows no longer on the official sheet. Branch overrides
  //    cascade off via the Prisma relation; OrderLineItem rows snapshot their
  //    own label text so historical invoices remain intact.
  await prisma.laundryPriceListItem.deleteMany({
    where: {
      code: {
        notIn: ROWS.map((row) => row.code),
      },
    },
  });

  // 4. Drop legacy categories. Items have already been reparented above and
  //    the relation uses ON DELETE SET NULL, so this step is always safe.
  await prisma.laundryItemCategory.deleteMany({
    where: {
      code: {
        notIn: CATEGORIES.map((c) => c.code),
      },
    },
  });

  console.info(
    `Master laundry tariff: ${ROWS.length} price-list rows (V5.2 PDF + SERVICES extras).`,
  );
}
