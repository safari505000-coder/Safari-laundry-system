import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const userPublicSelect = {
  id: true,
  username: true,
  fullName: true,
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
} satisfies Prisma.UserSelect;

export type UserPublic = Prisma.UserGetPayload<{
  select: typeof userPublicSelect;
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
          roleId,
          branchId: dto.branchId,
          phone: dto.phone,
        },
        select: userPublicSelect,
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
      select: userPublicSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<UserPublic> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userPublicSelect,
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
    if (dto.safariRole !== undefined) {
      const roleId = await this.resolveRoleId(dto.safariRole);
      data.safariRole = dto.safariRole;
      data.role = { connect: { id: roleId } };
    }
    const branchPatch = (dto as UpdateUserDto & { branchId?: string | null })
      .branchId;
    if (branchPatch !== undefined) {
      data.branch =
        branchPatch === null
          ? { disconnect: true }
          : { connect: { id: branchPatch } };
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
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { id, deleted: true };
  }
}
