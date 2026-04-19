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
const client_1 = require("@prisma/client");
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
    async getCatalogVersion() {
        const [items, cats, overrides, itemCount] = await Promise.all([
            this.prisma.laundryPriceListItem.aggregate({
                _max: { updatedAt: true },
            }),
            this.prisma.laundryItemCategory.aggregate({
                _max: { updatedAt: true },
            }),
            this.prisma.laundryBranchItemPrice.aggregate({
                _max: { updatedAt: true },
            }),
            this.prisma.laundryPriceListItem.count(),
        ]);
        const candidates = [
            items._max.updatedAt,
            cats._max.updatedAt,
            overrides._max.updatedAt,
        ].filter((d) => d instanceof Date);
        const stamp = candidates.length === 0
            ? '0'
            : candidates.reduce((a, b) => (a > b ? a : b)).toISOString();
        return `${stamp}|${itemCount}`;
    }
    async updatePriceItem(id, dto) {
        const existing = await this.prisma.laundryPriceListItem.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new common_1.NotFoundException('Laundry price item not found');
        }
        if (dto.categoryId !== undefined && dto.categoryId !== null) {
            const cat = await this.prisma.laundryItemCategory.findUnique({
                where: { id: dto.categoryId },
                select: { id: true },
            });
            if (!cat) {
                throw new common_1.NotFoundException('Category not found');
            }
        }
        const data = {};
        if (dto.nameAr !== undefined)
            data.nameAr = dto.nameAr;
        if (dto.nameEn !== undefined)
            data.nameEn = dto.nameEn;
        if (dto.sortOrder !== undefined)
            data.sortOrder = dto.sortOrder;
        if (dto.manualEntry !== undefined)
            data.manualEntry = dto.manualEntry;
        if (dto.isActive !== undefined)
            data.isActive = dto.isActive;
        if (dto.priceNormal !== undefined) {
            data.priceNormal = new client_1.Prisma.Decimal(dto.priceNormal);
        }
        if (dto.priceUrgent !== undefined) {
            data.priceUrgent = new client_1.Prisma.Decimal(dto.priceUrgent);
        }
        if (dto.pricePressOnly !== undefined) {
            data.pricePressOnly =
                dto.pricePressOnly === null
                    ? null
                    : new client_1.Prisma.Decimal(dto.pricePressOnly);
        }
        if (dto.priceUrgentPress !== undefined) {
            data.priceUrgentPress =
                dto.priceUrgentPress === null
                    ? null
                    : new client_1.Prisma.Decimal(dto.priceUrgentPress);
        }
        if (dto.categoryId !== undefined) {
            data.category =
                dto.categoryId === null
                    ? { disconnect: true }
                    : { connect: { id: dto.categoryId } };
        }
        const row = await this.prisma.laundryPriceListItem.update({
            where: { id },
            data,
            include: { category: true },
        });
        return this.mapItemDto(row);
    }
    async createPriceItem(dto) {
        const code = dto.code.trim().toUpperCase();
        const existing = await this.prisma.laundryPriceListItem.findUnique({
            where: { code },
            select: { id: true },
        });
        if (existing) {
            throw new common_1.ConflictException('An item with this code already exists.');
        }
        if (dto.categoryId) {
            const cat = await this.prisma.laundryItemCategory.findUnique({
                where: { id: dto.categoryId },
                select: { id: true },
            });
            if (!cat) {
                throw new common_1.NotFoundException('Category not found');
            }
        }
        const row = await this.prisma.laundryPriceListItem.create({
            data: {
                code,
                nameAr: dto.nameAr.trim(),
                nameEn: dto.nameEn?.trim() ?? null,
                sortOrder: dto.sortOrder ?? 0,
                manualEntry: dto.manualEntry ?? false,
                priceNormal: new client_1.Prisma.Decimal(dto.priceNormal ?? 0),
                priceUrgent: new client_1.Prisma.Decimal(dto.priceUrgent ?? 0),
                pricePressOnly: dto.pricePressOnly == null
                    ? null
                    : new client_1.Prisma.Decimal(dto.pricePressOnly),
                priceUrgentPress: dto.priceUrgentPress == null
                    ? null
                    : new client_1.Prisma.Decimal(dto.priceUrgentPress),
                categoryId: dto.categoryId ?? null,
            },
            include: { category: true },
        });
        return this.mapItemDto(row);
    }
    async deletePriceItem(id) {
        const existing = await this.prisma.laundryPriceListItem.findUnique({
            where: { id },
            select: { id: true, nameAr: true, nameEn: true },
        });
        if (!existing) {
            throw new common_1.NotFoundException('Laundry price item not found');
        }
        const labels = [existing.nameAr, existing.nameEn].filter((l) => typeof l === 'string' && l.length > 0);
        if (labels.length > 0) {
            const historyHit = await this.prisma.orderLineItem.count({
                where: { label: { in: labels } },
            });
            if (historyHit > 0) {
                throw new common_1.BadRequestException('Cannot delete: existing orders reference this item. Hide it instead (deactivate).');
            }
        }
        await this.prisma.laundryPriceListItem.delete({ where: { id } });
        return { deletedId: id };
    }
    async updateCategory(id, dto) {
        const existing = await this.prisma.laundryItemCategory.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new common_1.NotFoundException('Category not found');
        }
        const data = {};
        if (dto.nameAr !== undefined)
            data.nameAr = dto.nameAr;
        if (dto.nameEn !== undefined)
            data.nameEn = dto.nameEn;
        if (dto.sortOrder !== undefined)
            data.sortOrder = dto.sortOrder;
        const row = await this.prisma.laundryItemCategory.update({
            where: { id },
            data,
        });
        return {
            id: row.id,
            code: row.code,
            nameAr: row.nameAr,
            nameEn: row.nameEn,
            sortOrder: row.sortOrder,
        };
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
            isActive: r.isActive,
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