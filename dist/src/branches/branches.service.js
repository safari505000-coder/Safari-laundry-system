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
exports.BranchesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const IN_FLIGHT_ORDER_STATUSES = [
    client_1.OrderStatus.PENDING,
    client_1.OrderStatus.PICKED_UP,
    client_1.OrderStatus.IN_PROGRESS,
    client_1.OrderStatus.OUT_FOR_DELIVERY,
];
let BranchesService = class BranchesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    listAll() {
        return this.prisma.branch.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                location: true,
                phone: true,
                isActive: true,
                updatedAt: true,
            },
        });
    }
    async create(dto) {
        return this.prisma.branch.create({
            data: {
                name: dto.name.trim(),
                location: dto.location.trim(),
                phone: dto.phone?.trim() || null,
                isActive: dto.isActive ?? true,
            },
            select: {
                id: true,
                name: true,
                location: true,
                phone: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }
    async operationsLiveByBranch() {
        const driversWithActive = await this.prisma.user.findMany({
            where: {
                safariRole: client_1.SafariRole.DRIVER,
                branchId: { not: null },
                ordersAsDriver: {
                    some: { status: { in: IN_FLIGHT_ORDER_STATUSES } },
                },
            },
            select: { branchId: true },
            distinct: ['branchId'],
        });
        const live = new Set(driversWithActive
            .map((u) => u.branchId)
            .filter((id) => id != null));
        const all = await this.prisma.branch.findMany({
            select: { id: true },
            orderBy: { name: 'asc' },
        });
        return {
            branches: all.map((b) => ({
                branchId: b.id,
                isLive: live.has(b.id),
            })),
        };
    }
};
exports.BranchesService = BranchesService;
exports.BranchesService = BranchesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BranchesService);
//# sourceMappingURL=branches.service.js.map