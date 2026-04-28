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
const administrative_branch_util_1 = require("./administrative-branch.util");
const IN_FLIGHT_ORDER_STATUSES = [
    client_1.OrderStatus.PENDING,
    client_1.OrderStatus.PICKED_UP,
    client_1.OrderStatus.IN_PROGRESS,
    client_1.OrderStatus.OUT_FOR_DELIVERY,
];
const CREATE_BRANCH_KEYS = new Set([
    'name',
    'location',
    'phone',
    'isActive',
    'isAdministrative',
]);
function readOptionalSortOrder(v, field) {
    if (v === undefined)
        return undefined;
    if (v === null)
        return null;
    if (typeof v === 'number' && Number.isInteger(v))
        return v;
    if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) {
        return Number.parseInt(v.trim(), 10);
    }
    throw new common_1.BadRequestException(`${field} must be an integer or null`);
}
function assertPlainObject(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new common_1.BadRequestException('Invalid JSON body');
    }
    return raw;
}
function readBooleanField(v, field) {
    if (v === undefined)
        return undefined;
    if (v === true || v === false)
        return v;
    if (v === 'true' || v === 'false')
        return v === 'true';
    if (v === 1 || v === 0)
        return v === 1;
    throw new common_1.BadRequestException(`${field} must be a boolean`);
}
let BranchesService = class BranchesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    branchListSelect = {
        id: true,
        name: true,
        location: true,
        phone: true,
        isActive: true,
        isAdministrative: true,
        payrollRosterSortOrder: true,
        updatedAt: true,
    };
    listForRole(actorRole) {
        return this.prisma.branch.findMany({
            where: (0, administrative_branch_util_1.canSeeAdministrativeBranches)(actorRole)
                ? {}
                : { isAdministrative: false },
            orderBy: [
                { payrollRosterSortOrder: { sort: 'asc', nulls: 'last' } },
                { name: 'asc' },
            ],
            select: this.branchListSelect,
        });
    }
    createFromBody(body) {
        const o = assertPlainObject(body);
        for (const key of Object.keys(o)) {
            if (!CREATE_BRANCH_KEYS.has(key)) {
                throw new common_1.BadRequestException(`property ${key} should not exist`);
            }
        }
        const name = typeof o.name === 'string' ? o.name.trim() : '';
        const location = typeof o.location === 'string' ? o.location.trim() : '';
        if (!name) {
            throw new common_1.BadRequestException('Branch name is required');
        }
        if (name.length > 200) {
            throw new common_1.BadRequestException('Branch name is too long');
        }
        if (!location) {
            throw new common_1.BadRequestException('Branch location is required');
        }
        if (location.length > 500) {
            throw new common_1.BadRequestException('Branch location is too long');
        }
        let phone;
        if (o.phone !== undefined && o.phone !== null) {
            if (typeof o.phone !== 'string') {
                throw new common_1.BadRequestException('phone must be a string');
            }
            phone = o.phone.trim();
            if (phone.length > 40) {
                throw new common_1.BadRequestException('phone is too long');
            }
        }
        const isActive = readBooleanField(o.isActive, 'isActive');
        const isAdministrative = readBooleanField(o.isAdministrative, 'isAdministrative');
        return this.create({
            name,
            location,
            phone,
            isActive,
            isAdministrative,
        });
    }
    async create(dto) {
        return this.prisma.branch.create({
            data: {
                name: dto.name.trim(),
                location: dto.location.trim(),
                phone: dto.phone?.trim() || null,
                isActive: dto.isActive ?? true,
                isAdministrative: dto.isAdministrative ?? false,
            },
            select: {
                id: true,
                name: true,
                location: true,
                phone: true,
                isActive: true,
                isAdministrative: true,
                payrollRosterSortOrder: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }
    async update(id, dto) {
        const patch = {};
        if (dto.name !== undefined) {
            const trimmed = dto.name.trim();
            if (!trimmed)
                throw new common_1.BadRequestException('Branch name is required');
            patch.name = trimmed;
        }
        if (dto.location !== undefined) {
            const trimmed = dto.location.trim();
            if (!trimmed) {
                throw new common_1.BadRequestException('Branch location is required');
            }
            patch.location = trimmed;
        }
        if (dto.phone !== undefined) {
            const trimmed = dto.phone.trim();
            patch.phone = trimmed ? trimmed : null;
        }
        if (dto.isActive !== undefined) {
            patch.isActive = dto.isActive;
        }
        if (dto.isAdministrative !== undefined) {
            if (dto.isAdministrative === true) {
                const assigned = await this.prisma.user.count({
                    where: { branchId: id },
                });
                if (assigned > 0) {
                    throw new common_1.BadRequestException('Cannot mark branch as administrative while users are still assigned to it. Reassign staff first.');
                }
            }
            patch.isAdministrative = dto.isAdministrative;
        }
        if (dto.payrollRosterSortOrder !== undefined) {
            patch.payrollRosterSortOrder = dto.payrollRosterSortOrder;
        }
        try {
            return await this.prisma.branch.update({
                where: { id },
                data: patch,
                select: {
                    id: true,
                    name: true,
                    location: true,
                    phone: true,
                    isActive: true,
                    isAdministrative: true,
                    payrollRosterSortOrder: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                e.code === 'P2025') {
                throw new common_1.NotFoundException('Branch not found');
            }
            throw e;
        }
    }
    updateFromBody(id, body) {
        const o = assertPlainObject(body);
        const patch = {};
        if ('name' in o) {
            if (typeof o.name !== 'string') {
                throw new common_1.BadRequestException('name must be a string');
            }
            patch.name = o.name;
        }
        if ('location' in o) {
            if (typeof o.location !== 'string') {
                throw new common_1.BadRequestException('location must be a string');
            }
            patch.location = o.location;
        }
        if ('phone' in o) {
            if (o.phone === null) {
                patch.phone = '';
            }
            else if (typeof o.phone === 'string') {
                patch.phone = o.phone;
            }
            else {
                throw new common_1.BadRequestException('phone must be a string');
            }
        }
        if ('isActive' in o) {
            const b = readBooleanField(o.isActive, 'isActive');
            if (b === undefined) {
                throw new common_1.BadRequestException('isActive must be a boolean');
            }
            patch.isActive = b;
        }
        if ('isAdministrative' in o) {
            const b = readBooleanField(o.isAdministrative, 'isAdministrative');
            if (b === undefined) {
                throw new common_1.BadRequestException('isAdministrative must be a boolean');
            }
            patch.isAdministrative = b;
        }
        if ('payrollRosterSortOrder' in o) {
            patch.payrollRosterSortOrder = readOptionalSortOrder(o.payrollRosterSortOrder, 'payrollRosterSortOrder');
        }
        const unknown = Object.keys(o).filter((k) => ![
            'name',
            'location',
            'phone',
            'isActive',
            'isAdministrative',
            'payrollRosterSortOrder',
        ].includes(k));
        if (unknown.length) {
            throw new common_1.BadRequestException(`property ${unknown[0]} should not exist`);
        }
        if (Object.keys(patch).length === 0) {
            throw new common_1.BadRequestException('Send at least one field to update');
        }
        return this.update(id, patch);
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
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
        return {
            branches: all.map((b) => ({
                branchId: b.id,
                branchName: b.name,
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