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
exports.SerialsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const serial_counter_service_1 = require("./serial-counter.service");
let SerialsService = class SerialsService {
    prisma;
    counter;
    constructor(prisma, counter) {
        this.prisma = prisma;
        this.counter = counter;
    }
    async listDrivers() {
        const users = await this.prisma.user.findMany({
            where: { safariRole: client_1.SafariRole.DRIVER },
            select: {
                id: true,
                fullName: true,
                username: true,
                driverPrefix: true,
                isActive: true,
                branch: { select: { name: true } },
            },
            orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
        });
        return users.map((u) => ({
            id: u.id,
            fullName: u.fullName,
            username: u.username,
            driverPrefix: u.driverPrefix,
            branchName: u.branch?.name ?? null,
            isActive: u.isActive,
        }));
    }
    async setDriverPrefix(userId, rawPrefix) {
        const existing = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { safariRole: true },
        });
        if (!existing)
            throw new common_1.NotFoundException('User not found');
        if (existing.safariRole !== client_1.SafariRole.DRIVER) {
            throw new common_1.BadRequestException('Only DRIVER users can receive a prefix');
        }
        const normalised = typeof rawPrefix === 'string' && rawPrefix.trim().length > 0
            ? rawPrefix.trim().toUpperCase()
            : null;
        if (normalised !== null && !/^[A-Z]$/.test(normalised)) {
            throw new common_1.BadRequestException('driverPrefix must be a single uppercase letter A-Z');
        }
        try {
            const updated = await this.prisma.user.update({
                where: { id: userId },
                data: { driverPrefix: normalised },
                select: {
                    id: true,
                    fullName: true,
                    username: true,
                    driverPrefix: true,
                    isActive: true,
                    branch: { select: { name: true } },
                },
            });
            return {
                id: updated.id,
                fullName: updated.fullName,
                username: updated.username,
                driverPrefix: updated.driverPrefix,
                branchName: updated.branch?.name ?? null,
                isActive: updated.isActive,
            };
        }
        catch (err) {
            if (err instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002') {
                throw new common_1.ConflictException(`Prefix "${normalised}" is already assigned to another driver`);
            }
            throw err;
        }
    }
    async getSerialLog(limit = 50) {
        const take = Math.min(Math.max(limit, 1), 200);
        const [rowsRaw, counter] = await Promise.all([
            this.prisma.order.findMany({
                where: { serialNumber: { not: null } },
                orderBy: { createdAt: 'desc' },
                take,
                select: {
                    id: true,
                    serialNumber: true,
                    driverId: true,
                    totalPrice: true,
                    createdAt: true,
                    customer: { select: { displayName: true, phone: true } },
                    driver: {
                        select: {
                            fullName: true,
                            username: true,
                            driverPrefix: true,
                        },
                    },
                },
            }),
            this.counter.peek(),
        ]);
        const rows = rowsRaw.map((o) => ({
            orderId: o.id,
            serialNumber: o.serialNumber,
            driverId: o.driverId,
            driverName: o.driver?.fullName ?? o.driver?.username ?? null,
            driverPrefix: o.driver?.driverPrefix ?? null,
            customerName: o.customer?.displayName?.trim() ||
                o.customer?.phone?.trim() ||
                null,
            totalPriceKd: o.totalPrice.toString(),
            createdAtIso: o.createdAt.toISOString(),
        }));
        return { currentCounter: counter, rows };
    }
};
exports.SerialsService = SerialsService;
exports.SerialsService = SerialsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        serial_counter_service_1.SerialCounterService])
], SerialsService);
//# sourceMappingURL=serials.service.js.map