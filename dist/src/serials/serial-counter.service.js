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
    constructor(prisma) {
        this.prisma = prisma;
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
        const next = await this.incrementCounter(tx, SerialCounterService_1.ORDER_SERIAL_KEY);
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
};
exports.SerialCounterService = SerialCounterService;
exports.SerialCounterService = SerialCounterService = SerialCounterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SerialCounterService);
//# sourceMappingURL=serial-counter.service.js.map