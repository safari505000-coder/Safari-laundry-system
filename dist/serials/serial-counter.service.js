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
var SerialCounterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SerialCounterService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let SerialCounterService = class SerialCounterService {
    static { SerialCounterService_1 = this; }
    prisma;
    static ORDER_SERIAL_KEY = 'ORDER_SERIAL';
    static USER_ORDER_KEY_PREFIX = 'OU_';
    constructor(prisma) {
        this.prisma = prisma;
    }
    static orderSerialKeyForUser(userId) {
        return `${SerialCounterService_1.USER_ORDER_KEY_PREFIX}${userId}`;
    }
    escapeRegex(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    async maxSerialSuffixForOperator(tx, operatorId, prefix) {
        const rows = await tx.order.findMany({
            where: {
                driverId: operatorId,
                serialNumber: { startsWith: `${prefix}-` },
            },
            select: { serialNumber: true },
        });
        const re = new RegExp(`^${this.escapeRegex(prefix)}-(\\d+)$`);
        let maxN = 0;
        for (const r of rows) {
            if (!r.serialNumber)
                continue;
            const m = r.serialNumber.match(re);
            if (m) {
                const n = Number.parseInt(m[1], 10);
                if (Number.isFinite(n))
                    maxN = Math.max(maxN, n);
            }
        }
        return maxN;
    }
    async stampOrderSerial(tx, driverId) {
        if (!driverId)
            return null;
        const driver = await tx.user.findUnique({
            where: { id: driverId },
            select: { driverPrefix: true },
        });
        const prefix = driver?.driverPrefix?.trim();
        if (!prefix)
            return null;
        const key = SerialCounterService_1.orderSerialKeyForUser(driverId);
        const maxFromOrders = await this.maxSerialSuffixForOperator(tx, driverId, prefix);
        const row = await tx.serialCounter.findUnique({
            where: { key },
            select: { value: true },
        });
        const current = row?.value ?? 0;
        const floor = Math.max(current, maxFromOrders);
        if (floor > current) {
            await tx.serialCounter.upsert({
                where: { key },
                create: { key, value: floor },
                update: { value: floor },
            });
        }
        const next = await this.incrementCounter(tx, key);
        return `${prefix}-${next}`;
    }
    async incrementCounter(tx, key) {
        const row = await tx.serialCounter.upsert({
            where: { key },
            create: { key, value: 1 },
            update: { value: { increment: 1 } },
            select: { value: true },
        });
        if (!Number.isFinite(row.value)) {
            throw new common_1.InternalServerErrorException(`SerialCounter "${key}" returned non-numeric value`);
        }
        return row.value;
    }
    async peek(key = SerialCounterService_1.ORDER_SERIAL_KEY) {
        const row = await this.prisma.serialCounter.findUnique({
            where: { key },
            select: { value: true },
        });
        return row?.value ?? 0;
    }
    async countOrdersWithSerialNumber() {
        return this.prisma.order.count({
            where: { serialNumber: { not: null } },
        });
    }
};
exports.SerialCounterService = SerialCounterService;
exports.SerialCounterService = SerialCounterService = SerialCounterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SerialCounterService);
//# sourceMappingURL=serial-counter.service.js.map