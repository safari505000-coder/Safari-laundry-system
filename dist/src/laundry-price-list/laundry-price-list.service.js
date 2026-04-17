"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LaundryPriceListService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
function mergeTier(base, override) {
    if (base == null)
        return null;
    if (override != null)
        return override.toFixed(4);
    return base.toFixed(4);
}
function mergeRequired(base, override) {
    if (override != null)
        return override.toFixed(4);
    return base.toFixed(4);
}
let LaundryPriceListService = class LaundryPriceListService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findCategoriesForApi() {
        const rows = await this.prisma.laundryItemCategory.findMany({
            orderBy: { sortOrder: 'asc' },
        });
        return rows.map((r) => ({
            id: r.id,
            code: r.code,
            nameAr: r.nameAr,
            nameEn: r.nameEn,
            sortOrder: r.sortOrder,
        }));
    }
    async findPriceListForBranch(branchId) {
        const items = await this.prisma.laundryPriceListItem.findMany({
            orderBy: { sortOrder: 'asc' },
            include: { category: true },
        });
        let overrides = new Map();
        if (branchId) {
            const br = await this.prisma.laundryBranchItemPrice.findMany({
                where: { branchId },
            });
            overrides = new Map(br.map((x) => [
                x.laundryPriceListItemId,
                {
                    priceNormal: x.priceNormal,
                    priceUrgent: x.priceUrgent,
                    pricePressOnly: x.pricePressOnly,
                    priceUrgentPress: x.priceUrgentPress,
                },
            ]));
        }
        return items.map((row) => this.mapItemDto(row, overrides.get(row.id)));
    }
    async findAllForApi() {
        return this.findPriceListForBranch(null);
    }
    mapItemDto(r, ov) {
        const c = r.category;
        return {
            id: r.id,
            code: r.code,
            nameAr: r.nameAr,
            nameEn: r.nameEn,
            sortOrder: r.sortOrder,
            manualEntry: r.manualEntry,
            priceNormal: mergeRequired(r.priceNormal, ov?.priceNormal),
            priceUrgent: mergeRequired(r.priceUrgent, ov?.priceUrgent),
            pricePressOnly: mergeTier(r.pricePressOnly, ov?.pricePressOnly),
            priceUrgentPress: mergeTier(r.priceUrgentPress, ov?.priceUrgentPress),
            categoryId: c?.id ?? null,
            categoryCode: c?.code ?? null,
            categoryNameAr: c?.nameAr ?? null,
            categoryNameEn: c?.nameEn ?? null,
            categorySortOrder: c?.sortOrder ?? null,
        };
    }
};
exports.LaundryPriceListService = LaundryPriceListService;
exports.LaundryPriceListService = LaundryPriceListService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LaundryPriceListService);
//# sourceMappingURL=laundry-price-list.service.js.map