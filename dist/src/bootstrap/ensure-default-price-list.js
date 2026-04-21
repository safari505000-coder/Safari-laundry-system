"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PRICE_ITEMS = exports.BUSINESS_NAME_AR = void 0;
exports.ensureDefaultPriceList = ensureDefaultPriceList;
exports.BUSINESS_NAME_AR = 'مجموعة مصابغ سفاري السريعة';
exports.DEFAULT_PRICE_ITEMS = [
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
async function ensureDefaultPriceList(prisma) {
    const existing = await prisma.laundryPriceListItem.count();
    if (existing > 0) {
        return;
    }
    for (const [index, item] of exports.DEFAULT_PRICE_ITEMS.entries()) {
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
    console.log(`[${exports.BUSINESS_NAME_AR}] Fresh DB detected — bootstrap seed inserted ${exports.DEFAULT_PRICE_ITEMS.length} baseline items. Run 'npm run db:seed' for the full V19.10 tariff.`);
}
//# sourceMappingURL=ensure-default-price-list.js.map