"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcrypt"));
const client_1 = require("@prisma/client");
const permissions_service_1 = require("../permissions/permissions.service");
const prisma_service_1 = require("../prisma/prisma.service");
const userPublicSelect = {
    id: true,
    username: true,
    fullName: true,
    isActive: true,
    employeeId: true,
    jobTitle: true,
    phone: true,
    safariRole: true,
    roleId: true,
    branchId: true,
    createdAt: true,
    updatedAt: true,
    role: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true, location: true } },
};
let UsersService = class UsersService {
    prisma;
    permissionsService;
    constructor(prisma, permissionsService) {
        this.prisma = prisma;
        this.permissionsService = permissionsService;
    }
    async resolveRoleId(safariRole) {
        const role = await this.prisma.role.findUnique({
            where: { name: safariRole },
        });
        if (!role) {
            throw new common_1.BadRequestException(`Institutional role "${safariRole}" is not seeded — run prisma db seed`);
        }
        return role.id;
    }
    async create(dto) {
        const username = dto.username.trim();
        const fullName = dto.fullName.trim();
        const existingUsername = await this.prisma.user.findUnique({
            where: { username },
        });
        if (existingUsername) {
            throw new common_1.ConflictException('A user with this username already exists');
        }
        if (dto.phone) {
            const phoneTaken = await this.prisma.user.findFirst({
                where: { phone: dto.phone },
            });
            if (phoneTaken) {
                throw new common_1.ConflictException('A user with this phone number already exists');
            }
        }
        const roleId = await this.resolveRoleId(dto.safariRole);
        const passwordHash = await bcrypt.hash(dto.password, 12);
        try {
            return await this.prisma.user.create({
                data: {
                    username,
                    fullName,
                    password: passwordHash,
                    safariRole: dto.safariRole,
                    ...(dto.isActive !== undefined
                        ? { isActive: dto.isActive }
                        : {}),
                    roleId,
                    branchId: dto.branchId,
                    phone: dto.phone,
                },
                select: userPublicSelect,
            });
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                e.code === 'P2003') {
                throw new common_1.NotFoundException('Role or branch not found');
            }
            throw e;
        }
    }
    async findAll() {
        return this.prisma.user.findMany({
            select: userPublicSelect,
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: userPublicSelect,
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    async update(id, dto) {
        await this.findOne(id);
        if (dto.username !== undefined) {
            const u = dto.username.trim();
            const taken = await this.prisma.user.findFirst({
                where: { username: u, NOT: { id } },
            });
            if (taken) {
                throw new common_1.ConflictException('A user with this username already exists');
            }
        }
        if (dto.phone) {
            const phoneTaken = await this.prisma.user.findFirst({
                where: { phone: dto.phone, NOT: { id } },
            });
            if (phoneTaken) {
                throw new common_1.ConflictException('A user with this phone number already exists');
            }
        }
        const data = {};
        if (dto.fullName !== undefined)
            data.fullName = dto.fullName.trim();
        if (dto.username !== undefined)
            data.username = dto.username.trim();
        if (dto.phone !== undefined)
            data.phone = dto.phone;
        if (dto.isActive !== undefined) {
            data.isActive = dto.isActive;
        }
        if (dto.safariRole !== undefined) {
            const roleId = await this.resolveRoleId(dto.safariRole);
            data.safariRole = dto.safariRole;
            data.role = { connect: { id: roleId } };
        }
        const branchPatch = dto
            .branchId;
        if (branchPatch !== undefined) {
            if (branchPatch === null) {
                throw new common_1.BadRequestException('branchId is mandatory for all staff');
            }
            data.branch =
                { connect: { id: branchPatch } };
        }
        if (dto.password !== undefined) {
            data.password = await bcrypt.hash(dto.password, 12);
        }
        try {
            return await this.prisma.user.update({
                where: { id },
                data,
                select: userPublicSelect,
            });
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                e.code === 'P2003') {
                throw new common_1.NotFoundException('Role or branch not found');
            }
            throw e;
        }
    }
    async remove(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: { id: true, safariRole: true, username: true },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (user.safariRole === client_1.SafariRole.OWNER) {
            throw new common_1.ForbiddenException('Owner accounts cannot be deleted');
        }
        const refs = await this.prisma.$transaction([
            this.prisma.shift.count({ where: { driverId: id } }),
            this.prisma.order.count({ where: { driverId: id } }),
            this.prisma.bankDepositLog.count({
                where: {
                    OR: [{ uploadedById: id }, { verifiedByAccountantId: id }],
                },
            }),
            this.prisma.branchExpense.count({ where: { recordedById: id } }),
            this.prisma.payroll.count({ where: { userId: id } }),
        ]);
        const hasReferences = refs.some((n) => n > 0);
        if (hasReferences) {
            throw new common_1.ConflictException('Cannot delete this user because financial/operational records reference it. Deactivate the account instead.');
        }
        try {
            await this.prisma.user.delete({ where: { id } });
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                e.code === 'P2003') {
                throw new common_1.ConflictException('Cannot delete this user because related records still exist. Deactivate the account instead.');
            }
            throw e;
        }
        return { id, deleted: true };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        permissions_service_1.PermissionsService])
], UsersService);
//# sourceMappingURL=users.service.js.map