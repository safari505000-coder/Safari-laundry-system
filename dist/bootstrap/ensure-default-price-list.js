"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUSINESS_NAME_AR = void 0;
exports.ensureDefaultPriceList = ensureDefaultPriceList;
const laundry_price_list_seed_1 = require("./laundry-price-list.seed");
exports.BUSINESS_NAME_AR = 'مجموعة مصابغ سفاري السريعة';
async function ensureDefaultPriceList(prisma) {
    const existing = await prisma.laundryPriceListItem.count();
    if (existing > 0) {
        return;
    }
    await (0, laundry_price_list_seed_1.seedLaundryPriceList)(prisma);
    const n = await prisma.laundryPriceListItem.count();
    console.log(`[${exports.BUSINESS_NAME_AR}] Fresh DB — full laundry tariff applied (${n} rows). ` +
        `Drivers/Managers: use branch-scoped JWT for merged catalog.`);
}
//# sourceMappingURL=ensure-default-price-list.js.map