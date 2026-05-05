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
exports.PermissionsService = void 0;
const common_1 = require("@nestjs/common");
const capabilities_1 = require("../auth/capabilities");
const roles_permissions_map_1 = require("../auth/permissions/roles-permissions.map");
const prisma_service_1 = require("../prisma/prisma.service");
const roleWithPermissionsSelect = {
    id: true,
    name: true,
    createdAt: true,
    updatedAt: true,
    permissions: { select: { id: true, key: true } },
};
let PermissionsService = class PermissionsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listPermissions() {
        return this.prisma.permission.findMany({
            orderBy: { key: 'asc' },
            select: { id: true, key: true, createdAt: true, updatedAt: true },
        });
    }
    async listPermissionKeysForRoleName(roleName) {
        const r = await this.prisma.role.findUnique({
            where: { name: roleName },
            select: { permissions: { select: { key: true } } },
        });
        const fromDb = (r?.permissions ?? []).map((p) => p.key);
        const fromBuiltin = (0, roles_permissions_map_1.permissionsForRole)(roleName);
        return Array.from(new Set([...fromDb, ...fromBuiltin]));
    }
    async getRoleWithPermissions(roleId) {
        const role = await this.prisma.role.findUnique({
            where: { id: roleId },
            select: roleWithPermissionsSelect,
        });
        if (!role) {
            throw new common_1.NotFoundException('Role not found');
        }
        return role;
    }
    async grantToRole(roleId, dto) {
        await this.getRoleWithPermissions(roleId);
        const permission = await this.prisma.permission.findUnique({
            where: { key: dto.permissionKey },
        });
        if (!permission) {
            throw new common_1.NotFoundException(`Permission "${dto.permissionKey}" not found`);
        }
        await this.prisma.role.update({
            where: { id: roleId },
            data: {
                permissions: { connect: { id: permission.id } },
            },
        });
        return this.getRoleWithPermissions(roleId);
    }
    async revokeFromRole(roleId, dto) {
        await this.getRoleWithPermissions(roleId);
        const permission = await this.prisma.permission.findUnique({
            where: { key: dto.permissionKey },
        });
        if (!permission) {
            throw new common_1.NotFoundException(`Permission "${dto.permissionKey}" not found`);
        }
        await this.prisma.role.update({
            where: { id: roleId },
            data: {
                permissions: { disconnect: { id: permission.id } },
            },
        });
        return this.getRoleWithPermissions(roleId);
    }
    async roleHasCapability(roleName, capability) {
        if ((0, capabilities_1.roleHasBuiltinCapability)(roleName, capability))
            return true;
        if (!roleName)
            return false;
        const role = await this.prisma.role.findUnique({
            where: { name: roleName },
            select: {
                permissions: {
                    where: { key: capability },
                    select: { id: true },
                    take: 1,
                },
            },
        });
        return Boolean(role?.permissions?.length);
    }
    async canManageStaff(roleName) {
        return this.roleHasCapability(roleName, capabilities_1.CAN_MANAGE_STAFF);
    }
    async canCreateCustomer(roleName) {
        return this.roleHasCapability(roleName, capabilities_1.CREATE_CUSTOMER);
    }
};
exports.PermissionsService = PermissionsService;
exports.PermissionsService = PermissionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PermissionsService);
//# sourceMappingURL=permissions.service.js.map