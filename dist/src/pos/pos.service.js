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
exports.PosService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
function composeKuwaitAddressLine(dto) {
    const parts = [
        dto.addressArea,
        dto.addressBlock,
        dto.addressStreet,
        dto.addressAvenue,
        dto.addressHouse,
    ]
        .map((s) => s?.trim())
        .filter((s) => Boolean(s));
    return parts.length ? parts.join(' · ') : null;
}
const customerSelect = {
    id: true,
    phone: true,
    phone2: true,
    displayName: true,
    address: true,
    motherContact: true,
    wifeContact: true,
    sonContact: true,
    addressArea: true,
    addressBlock: true,
    addressStreet: true,
    addressAvenue: true,
    addressHouse: true,
    createdAt: true,
    wallet: {
        select: {
            balance: true,
            debt: true,
        },
    },
};
let PosService = class PosService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getCustomerBillingProfile(customerId) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const wallet = await this.prisma.customerWallet.findUnique({
            where: { customerId },
        });
        const lastActivation = await this.prisma.transactionHistory.findFirst({
            where: {
                customerId,
                type: client_1.LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
            },
            orderBy: { createdAt: 'desc' },
            select: { metadata: true, createdAt: true },
        });
        const meta = lastActivation?.metadata;
        const balanceStr = wallet?.balance.toString() ?? '0.0000';
        const balanceNum = Number.parseFloat(balanceStr);
        const subscriptionActive = Number.isFinite(balanceNum) && balanceNum > 0;
        return {
            subscriptionActive,
            planType: meta?.planName ?? null,
            remainingBalance: balanceStr,
            debt: wallet?.debt.toString() ?? '0.0000',
            lastSubscriptionAt: lastActivation?.createdAt?.toISOString() ?? null,
        };
    }
    async searchCustomers(query) {
        const q = query.trim();
        if (q.length < 2) {
            throw new common_1.BadRequestException('Search query must be at least 2 characters');
        }
        return this.prisma.customer.findMany({
            where: {
                OR: [
                    { phone: { contains: q, mode: 'insensitive' } },
                    { phone2: { contains: q, mode: 'insensitive' } },
                    { address: { contains: q, mode: 'insensitive' } },
                    { displayName: { contains: q, mode: 'insensitive' } },
                    { addressArea: { contains: q, mode: 'insensitive' } },
                    { addressBlock: { contains: q, mode: 'insensitive' } },
                    { addressStreet: { contains: q, mode: 'insensitive' } },
                    { addressAvenue: { contains: q, mode: 'insensitive' } },
                    { addressHouse: { contains: q, mode: 'insensitive' } },
                ],
            },
            take: 50,
            orderBy: { createdAt: 'desc' },
            select: customerSelect,
        });
    }
    async createCustomer(dto) {
        const compact = dto.phone.replace(/[\s-]/g, '').trim();
        const compact2 = dto.phone2?.replace(/[\s-]/g, '').trim() || null;
        if (compact2 && compact2 === compact) {
            throw new common_1.BadRequestException('Secondary phone must be different from primary phone');
        }
        const addressLine = composeKuwaitAddressLine(dto);
        const existing = await this.prisma.customer.findFirst({
            where: {
                OR: [
                    { phone: compact },
                    { phone2: compact },
                    ...(compact2 ? [{ phone: compact2 }, { phone2: compact2 }] : []),
                ],
            },
            select: { id: true, phone: true, phone2: true },
        });
        if (existing) {
            return this.prisma.customer.update({
                where: { id: existing.id },
                data: {
                    displayName: dto.displayName.trim(),
                    phone2: compact2 ??
                        (existing.phone !== compact ? compact : existing.phone2) ??
                        null,
                    address: addressLine,
                    motherContact: dto.motherContact?.trim() || null,
                    wifeContact: dto.wifeContact?.trim() || null,
                    sonContact: dto.sonContact?.trim() || null,
                    addressArea: dto.addressArea?.trim() || null,
                    addressBlock: dto.addressBlock?.trim() || null,
                    addressStreet: dto.addressStreet?.trim() || null,
                    addressAvenue: dto.addressAvenue?.trim() || null,
                    addressHouse: dto.addressHouse?.trim() || null,
                },
                select: customerSelect,
            });
        }
        return this.prisma.customer.create({
            data: {
                phone: compact,
                phone2: compact2,
                displayName: dto.displayName.trim(),
                address: addressLine,
                motherContact: dto.motherContact?.trim() || null,
                wifeContact: dto.wifeContact?.trim() || null,
                sonContact: dto.sonContact?.trim() || null,
                addressArea: dto.addressArea?.trim() || null,
                addressBlock: dto.addressBlock?.trim() || null,
                addressStreet: dto.addressStreet?.trim() || null,
                addressAvenue: dto.addressAvenue?.trim() || null,
                addressHouse: dto.addressHouse?.trim() || null,
            },
            select: customerSelect,
        });
    }
};
exports.PosService = PosService;
exports.PosService = PosService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PosService);
//# sourceMappingURL=pos.service.js.map