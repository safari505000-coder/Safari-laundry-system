import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionKeyDto } from './dto/permission-key.dto';
declare const roleWithPermissionsSelect: {
    id: true;
    name: true;
    createdAt: true;
    updatedAt: true;
    permissions: {
        select: {
            id: true;
            key: true;
        };
    };
};
export type RoleWithPermissions = Prisma.RoleGetPayload<{
    select: typeof roleWithPermissionsSelect;
}>;
export declare class PermissionsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listPermissions(): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        key: string;
    }[]>;
    getRoleWithPermissions(roleId: string): Promise<RoleWithPermissions>;
    grantToRole(roleId: string, dto: PermissionKeyDto): Promise<RoleWithPermissions>;
    revokeFromRole(roleId: string, dto: PermissionKeyDto): Promise<RoleWithPermissions>;
    roleHasCapability(roleName: string | null | undefined, capability: string): Promise<boolean>;
    canManageStaff(roleName: string | null | undefined): Promise<boolean>;
    canCreateCustomer(roleName: string | null | undefined): Promise<boolean>;
}
export {};
