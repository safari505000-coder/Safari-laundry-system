import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionKeyDto } from './dto/permission-key.dto';

const roleWithPermissionsSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  permissions: { select: { id: true, key: true } },
} satisfies Prisma.RoleSelect;

export type RoleWithPermissions = Prisma.RoleGetPayload<{
  select: typeof roleWithPermissionsSelect;
}>;

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: { key: 'asc' },
      select: { id: true, key: true, createdAt: true, updatedAt: true },
    });
  }

  async getRoleWithPermissions(roleId: string): Promise<RoleWithPermissions> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: roleWithPermissionsSelect,
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  async grantToRole(
    roleId: string,
    dto: PermissionKeyDto,
  ): Promise<RoleWithPermissions> {
    await this.getRoleWithPermissions(roleId);

    const permission = await this.prisma.permission.findUnique({
      where: { key: dto.permissionKey },
    });
    if (!permission) {
      throw new NotFoundException(
        `Permission "${dto.permissionKey}" not found`,
      );
    }

    await this.prisma.role.update({
      where: { id: roleId },
      data: {
        permissions: { connect: { id: permission.id } },
      },
    });

    return this.getRoleWithPermissions(roleId);
  }

  async revokeFromRole(
    roleId: string,
    dto: PermissionKeyDto,
  ): Promise<RoleWithPermissions> {
    await this.getRoleWithPermissions(roleId);

    const permission = await this.prisma.permission.findUnique({
      where: { key: dto.permissionKey },
    });
    if (!permission) {
      throw new NotFoundException(
        `Permission "${dto.permissionKey}" not found`,
      );
    }

    await this.prisma.role.update({
      where: { id: roleId },
      data: {
        permissions: { disconnect: { id: permission.id } },
      },
    });

    return this.getRoleWithPermissions(roleId);
  }
}
