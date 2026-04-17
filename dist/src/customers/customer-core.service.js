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
exports.CustomerCoreService = exports.customerCoreSelect = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
exports.customerCoreSelect = {
    id: true,
    phone: true,
    phone2: true,
    displayName: true,
    address: true,
    addressArea: true,
    addressBlock: true,
    addressStreet: true,
    addressAvenue: true,
    addressHouse: true,
    motherContact: true,
    wifeContact: true,
    sonContact: true,
    createdAt: true,
    updatedAt: true,
};
function isNumericQuery(value) {
    return /^[0-9]+$/.test(value);
}
function composeAddressLine(dto) {
    const parts = [
        dto.addressArea,
        dto.addressBlock,
        dto.addressStreet,
        dto.addressAvenue,
        dto.addressHouse,
    ].filter((x) => Boolean(x?.trim()));
    return parts.length ? parts.join(' · ') : null;
}
let CustomerCoreService = class CustomerCoreService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(query) {
        const q = (query ?? '').trim();
        if (q.length >= 2 && isNumericQuery(q)) {
            return this.listByPhonePriority(q);
        }
        return this.prisma.customer.findMany({
            where: q.length < 2
                ? undefined
                : {
                    OR: [
                        { phone: { contains: q, mode: 'insensitive' } },
                        { phone2: { contains: q, mode: 'insensitive' } },
                        { displayName: { contains: q, mode: 'insensitive' } },
                        { address: { contains: q, mode: 'insensitive' } },
                        { motherContact: { contains: q, mode: 'insensitive' } },
                        { wifeContact: { contains: q, mode: 'insensitive' } },
                        { sonContact: { contains: q, mode: 'insensitive' } },
                    ],
                },
            orderBy: { createdAt: 'desc' },
            take: 200,
            select: exports.customerCoreSelect,
        });
    }
    async listByPhonePriority(query) {
        const q = query.trim();
        if (q.length < 2) {
            return this.list();
        }
        return this.prisma.customer.findMany({
            where: {
                OR: [
                    { phone: { contains: q, mode: 'insensitive' } },
                    { phone2: { contains: q, mode: 'insensitive' } },
                ],
            },
            orderBy: [{ createdAt: 'desc' }],
            take: 200,
            select: exports.customerCoreSelect,
        });
    }
    async getById(id) {
        return this.prisma.customer.findUnique({
            where: { id },
            select: exports.customerCoreSelect,
        });
    }
    async update(id, dto) {
        const addressLine = composeAddressLine(dto);
        const data = {
            ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
            ...(dto.phone2 !== undefined ? { phone2: dto.phone2 } : {}),
            ...(dto.addressArea !== undefined ? { addressArea: dto.addressArea } : {}),
            ...(dto.addressBlock !== undefined ? { addressBlock: dto.addressBlock } : {}),
            ...(dto.addressStreet !== undefined ? { addressStreet: dto.addressStreet } : {}),
            ...(dto.addressAvenue !== undefined ? { addressAvenue: dto.addressAvenue } : {}),
            ...(dto.addressHouse !== undefined ? { addressHouse: dto.addressHouse } : {}),
            ...(dto.motherContact !== undefined ? { motherContact: dto.motherContact } : {}),
            ...(dto.wifeContact !== undefined ? { wifeContact: dto.wifeContact } : {}),
            ...(dto.sonContact !== undefined ? { sonContact: dto.sonContact } : {}),
        };
        if (dto.addressArea !== undefined ||
            dto.addressBlock !== undefined ||
            dto.addressStreet !== undefined ||
            dto.addressAvenue !== undefined ||
            dto.addressHouse !== undefined) {
            data.address = addressLine;
        }
        return this.prisma.customer.update({
            where: { id },
            data,
            select: exports.customerCoreSelect,
        });
    }
};
exports.CustomerCoreService = CustomerCoreService;
exports.CustomerCoreService = CustomerCoreService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CustomerCoreService);
//# sourceMappingURL=customer-core.service.js.map