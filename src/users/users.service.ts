import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, SafariRole } from '@prisma/client';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const userPublicSelect = {
  id: true,
  username: true,
  fullName: true,
  // Added via migration.
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

export type UserPublic = Prisma.UserGetPayload<{ select: Prisma.UserSelect }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private async resolveRoleId(safariRole: SafariRole): Promise<string> {
    const role = await this.prisma.role.findUnique({
      where: { name: safariRole },
    });
    if (!role) {
      throw new BadRequestException(
        `Institutional role "${safariRole}" is not seeded — run prisma db seed`,
      );
    }
    return role.id;
  }

  async create(dto: CreateUserDto): Promise<UserPublic> {
    const username = dto.username.trim();
    const fullName = dto.fullName.trim();

    const existingUsername = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existingUsername) {
      throw new ConflictException('A user with this username already exists');
    }

    if (dto.phone) {
      const phoneTaken = await this.prisma.user.findFirst({
        where: { phone: dto.phone },
      });
      if (phoneTaken) {
        throw new ConflictException(
          'A user with this phone number already exists',
        );
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
            ? ({ isActive: dto.isActive } as Record<string, unknown>)
            : {}),
          roleId,
          branchId: dto.branchId,
          phone: dto.phone,
        },
        select: userPublicSelect as Prisma.UserSelect,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new NotFoundException('Role or branch not found');
      }
      throw e;
    }
  }

  async findAll(): Promise<UserPublic[]> {
    return this.prisma.user.findMany({
      select: userPublicSelect as Prisma.UserSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<UserPublic> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userPublicSelect as Prisma.UserSelect,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserPublic> {
    await this.findOne(id);

    if (dto.username !== undefined) {
      const u = dto.username.trim();
      const taken = await this.prisma.user.findFirst({
        where: { username: u, NOT: { id } },
      });
      if (taken) {
        throw new ConflictException('A user with this username already exists');
      }
    }

    if (dto.phone) {
      const phoneTaken = await this.prisma.user.findFirst({
        where: { phone: dto.phone, NOT: { id } },
      });
      if (phoneTaken) {
        throw new ConflictException(
          'A user with this phone number already exists',
        );
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.username !== undefined) data.username = dto.username.trim();
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.isActive !== undefined) {
      (data as unknown as Record<string, unknown>).isActive = dto.isActive;
    }
    if (dto.safariRole !== undefined) {
      const roleId = await this.resolveRoleId(dto.safariRole);
      data.safariRole = dto.safariRole;
      data.role = { connect: { id: roleId } };
    }
    const branchPatch = (dto as UpdateUserDto & { branchId?: string | null })
      .branchId;
    if (branchPatch !== undefined) {
      if (branchPatch === null) {
        throw new BadRequestException('branchId is mandatory for all staff');
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
        select: userPublicSelect as Prisma.UserSelect,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new NotFoundException('Role or branch not found');
      }
      throw e;
    }
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, safariRole: true, username: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.safariRole === SafariRole.OWNER) {
      throw new ForbiddenException('Owner accounts cannot be deleted');
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
      throw new ConflictException(
        'Cannot delete this user because financial/operational records reference it. Deactivate the account instead.',
      );
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new ConflictException(
          'Cannot delete this user because related records still exist. Deactivate the account instead.',
        );
      }
      throw e;
    }
    return { id, deleted: true };
  }
}
