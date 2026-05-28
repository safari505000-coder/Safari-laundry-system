import { Prisma, PrismaClient } from '@prisma/client';

const POS_DELIVERY_FEE_KD = new Prisma.Decimal('0.2500');

export async function buildPosCheckoutLineItemsForTotal(
  prisma: PrismaClient,
  totalKd: string | number,
) {
  const total = new Prisma.Decimal(totalKd);
  const itemPrice = total.minus(POS_DELIVERY_FEE_KD);
  if (itemPrice.lte(0)) {
    throw new Error(
      `POS checkout test total ${total.toFixed(4)} must exceed delivery fee ${POS_DELIVERY_FEE_KD.toFixed(4)}`,
    );
  }
  const category = await prisma.laundryItemCategory.upsert({
    where: { code: 'TEST_POS' },
    update: {},
    create: {
      code: 'TEST_POS',
      nameAr: 'اختبار POS',
      nameEn: 'POS Test',
      sortOrder: 9999,
    },
  });
  const code = `TEST_POS_${total.toFixed(4).replace('.', '_')}`;
  const item = await prisma.laundryPriceListItem.upsert({
    where: { code },
    update: {
      isActive: true,
      manualEntry: false,
      priceNormal: itemPrice,
      priceUrgent: itemPrice,
      pricePressOnly: itemPrice,
      priceUrgentPress: itemPrice,
      categoryId: category.id,
    },
    create: {
      code,
      nameAr: `اختبار ${total.toFixed(4)}`,
      nameEn: `Test ${total.toFixed(4)}`,
      isActive: true,
      manualEntry: false,
      priceNormal: itemPrice,
      priceUrgent: itemPrice,
      pricePressOnly: itemPrice,
      priceUrgentPress: itemPrice,
      categoryId: category.id,
    },
  });
  return [
    {
      label: item.nameAr,
      laundryPriceListItemId: item.id,
      posServiceKey: 'NORMAL' as const,
      quantity: 1,
      unitPrice: Number(itemPrice.toFixed(4)),
    },
  ];
}
