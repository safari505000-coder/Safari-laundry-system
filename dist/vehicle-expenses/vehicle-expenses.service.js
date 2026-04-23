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
exports.VehicleExpensesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const REVIEWER_ROLES = new Set([
    client_1.SafariRole.ACCOUNTANT,
    client_1.SafariRole.OWNER,
    client_1.SafariRole.GENERAL_MANAGER,
]);
const INCLUDE_PEOPLE = {
    submittedBy: {
        select: { id: true, fullName: true, username: true },
    },
    reviewedBy: {
        select: { id: true, fullName: true, username: true },
    },
};
let VehicleExpensesService = class VehicleExpensesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, safariRole, dto) {
        if (safariRole !== client_1.SafariRole.FLEET_SUPERVISOR) {
            throw new common_1.ForbiddenException('Only FLEET_SUPERVISOR can log vehicle expenses');
        }
        const receipt = dto.receiptUrl?.trim();
        if (!receipt) {
            throw new common_1.BadRequestException('Receipt photo is mandatory for vehicle expenses');
        }
        const amount = new client_1.Prisma.Decimal(Number(dto.amount).toFixed(4));
        if (amount.lte(0)) {
            throw new common_1.BadRequestException('Amount must be positive');
        }
        return this.prisma.vehicleExpense.create({
            data: {
                vehiclePlate: dto.vehiclePlate.trim(),
                vehicleLabel: dto.vehicleLabel?.trim() || null,
                expenseType: dto.expenseType,
                amount,
                odometerKm: dto.odometerKm ?? null,
                vendorName: dto.vendorName?.trim() || null,
                description: dto.description?.trim() || null,
                receiptUrl: receipt,
                status: client_1.VehicleExpenseStatus.PENDING_ACCOUNTANT,
                submittedById: userId,
                expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : new Date(),
            },
            include: INCLUDE_PEOPLE,
        });
    }
    async listForUser(userId, safariRole, filters) {
        const isFleet = safariRole === client_1.SafariRole.FLEET_SUPERVISOR;
        const isReviewer = REVIEWER_ROLES.has(safariRole);
        if (!isFleet && !isReviewer) {
            throw new common_1.ForbiddenException();
        }
        const where = {};
        if (isFleet)
            where.submittedById = userId;
        if (filters.from || filters.to) {
            where.expenseDate = {};
            if (filters.from)
                where.expenseDate.gte = new Date(filters.from);
            if (filters.to)
                where.expenseDate.lte = new Date(filters.to);
        }
        if (filters.status)
            where.status = filters.status;
        if (filters.expenseType)
            where.expenseType = filters.expenseType;
        if (filters.vehiclePlate) {
            where.vehiclePlate = {
                contains: filters.vehiclePlate.trim(),
                mode: 'insensitive',
            };
        }
        return this.prisma.vehicleExpense.findMany({
            where,
            orderBy: { expenseDate: 'desc' },
            include: INCLUDE_PEOPLE,
        });
    }
    async listPendingApproval(safariRole) {
        if (!REVIEWER_ROLES.has(safariRole)) {
            throw new common_1.ForbiddenException();
        }
        return this.prisma.vehicleExpense.findMany({
            where: { status: client_1.VehicleExpenseStatus.PENDING_ACCOUNTANT },
            orderBy: { expenseDate: 'desc' },
            include: INCLUDE_PEOPLE,
        });
    }
    async updateStatus(id, safariRole, actorUserId, dto) {
        if (safariRole !== client_1.SafariRole.ACCOUNTANT) {
            throw new common_1.ForbiddenException('Only ACCOUNTANT can approve or reject vehicle expenses');
        }
        const existing = await this.prisma.vehicleExpense.findUnique({
            where: { id },
            select: { id: true, status: true },
        });
        if (!existing) {
            throw new common_1.NotFoundException('Vehicle expense not found');
        }
        if (existing.status !== client_1.VehicleExpenseStatus.PENDING_ACCOUNTANT) {
            throw new common_1.BadRequestException('Only a pending vehicle expense can be approved or rejected');
        }
        if (dto.status === client_1.VehicleExpenseStatus.REJECTED &&
            !dto.rejectionReason?.trim()) {
            throw new common_1.BadRequestException('Rejection reason is required');
        }
        return this.prisma.vehicleExpense.update({
            where: { id },
            data: {
                status: dto.status,
                reviewedById: actorUserId,
                reviewedAt: new Date(),
                rejectionReason: dto.status === client_1.VehicleExpenseStatus.REJECTED
                    ? (dto.rejectionReason?.trim() ?? null)
                    : null,
            },
            include: INCLUDE_PEOPLE,
        });
    }
    async getReport(safariRole, filters) {
        if (!REVIEWER_ROLES.has(safariRole)) {
            throw new common_1.ForbiddenException();
        }
        const from = new Date(filters.from);
        const to = new Date(filters.to);
        if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf())) {
            throw new common_1.BadRequestException('Invalid date range');
        }
        const rows = await this.prisma.vehicleExpense.findMany({
            where: {
                status: client_1.VehicleExpenseStatus.APPROVED,
                expenseDate: { gte: from, lte: to },
            },
            select: {
                id: true,
                vehiclePlate: true,
                vehicleLabel: true,
                expenseType: true,
                amount: true,
                expenseDate: true,
            },
            orderBy: { expenseDate: 'desc' },
        });
        let total = new client_1.Prisma.Decimal(0);
        const byVehicle = new Map();
        const byType = new Map();
        const byMonth = new Map();
        for (const row of rows) {
            total = total.add(row.amount);
            const vehicleKey = row.vehiclePlate;
            const vehicleAgg = byVehicle.get(vehicleKey) ?? {
                vehiclePlate: row.vehiclePlate,
                vehicleLabel: row.vehicleLabel,
                amount: new client_1.Prisma.Decimal(0),
                count: 0,
            };
            vehicleAgg.amount = vehicleAgg.amount.add(row.amount);
            vehicleAgg.count += 1;
            if (!vehicleAgg.vehicleLabel && row.vehicleLabel) {
                vehicleAgg.vehicleLabel = row.vehicleLabel;
            }
            byVehicle.set(vehicleKey, vehicleAgg);
            const typeAgg = byType.get(row.expenseType) ?? {
                amount: new client_1.Prisma.Decimal(0),
                count: 0,
            };
            typeAgg.amount = typeAgg.amount.add(row.amount);
            typeAgg.count += 1;
            byType.set(row.expenseType, typeAgg);
            const monthKey = `${row.expenseDate.getUTCFullYear()}-${String(row.expenseDate.getUTCMonth() + 1).padStart(2, '0')}`;
            const monthAgg = byMonth.get(monthKey) ?? {
                amount: new client_1.Prisma.Decimal(0),
                count: 0,
            };
            monthAgg.amount = monthAgg.amount.add(row.amount);
            monthAgg.count += 1;
            byMonth.set(monthKey, monthAgg);
        }
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            totalKd: total.toString(),
            count: rows.length,
            byVehicle: Array.from(byVehicle.values())
                .map((v) => ({
                vehiclePlate: v.vehiclePlate,
                vehicleLabel: v.vehicleLabel,
                amountKd: v.amount.toString(),
                count: v.count,
            }))
                .sort((a, b) => new client_1.Prisma.Decimal(b.amountKd).cmp(new client_1.Prisma.Decimal(a.amountKd))),
            byType: Array.from(byType.entries())
                .map(([type, v]) => ({
                expenseType: type,
                amountKd: v.amount.toString(),
                count: v.count,
            }))
                .sort((a, b) => new client_1.Prisma.Decimal(b.amountKd).cmp(new client_1.Prisma.Decimal(a.amountKd))),
            byMonth: Array.from(byMonth.entries())
                .map(([month, v]) => ({
                month,
                amountKd: v.amount.toString(),
                count: v.count,
            }))
                .sort((a, b) => a.month.localeCompare(b.month)),
        };
    }
};
exports.VehicleExpensesService = VehicleExpensesService;
exports.VehicleExpensesService = VehicleExpensesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], VehicleExpensesService);
//# sourceMappingURL=vehicle-expenses.service.js.map