import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const IN_FLIGHT_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PICKED_UP,
  OrderStatus.IN_PROGRESS,
  OrderStatus.OUT_FOR_DELIVERY,
];

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  listAll() {
    return this.prisma.branch.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        location: true,
        phone: true,
        isActive: true,
        updatedAt: true,
      },
    });
  }

  async create(dto: {
    name: string;
    location: string;
    phone?: string;
    isActive?: boolean;
  }) {
    return this.prisma.branch.create({
      data: {
        name: dto.name.trim(),
        location: dto.location.trim(),
        phone: dto.phone?.trim() || null,
        isActive: dto.isActive ?? true,
      },
      select: {
        id: true,
        name: true,
        location: true,
        phone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * V19.21 — OWNER / GM can edit any branch field. Partial patch:
   * only fields present in `dto` are written, so a single toggle
   * (say, `isActive = false`) doesn't blank the phone or rename
   * the branch. Empty / whitespace-only strings for `phone` are
   * stored as NULL to match the "no phone" display convention on
   * the branches grid.
   *
   * We surface a clean 404 on unknown IDs instead of letting Prisma
   * bubble its P2025 error through the controller — the UI needs a
   * readable "branch not found" toast for the edit dialog.
   */
  async update(
    id: string,
    dto: {
      name?: string;
      location?: string;
      phone?: string;
      isActive?: boolean;
    },
  ) {
    const patch: Prisma.BranchUpdateInput = {};
    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (!trimmed) throw new BadRequestException('Branch name is required');
      patch.name = trimmed;
    }
    if (dto.location !== undefined) {
      const trimmed = dto.location.trim();
      if (!trimmed) {
        throw new BadRequestException('Branch location is required');
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
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Branch not found');
      }
      throw e;
    }
  }

  /** Branches with at least one in-flight order assigned to a driver at that branch. */
  async operationsLiveByBranch(): Promise<{
    branches: { branchId: string; isLive: boolean }[];
  }> {
    const driversWithActive = await this.prisma.user.findMany({
      where: {
        safariRole: SafariRole.DRIVER,
        branchId: { not: null },
        ordersAsDriver: {
          some: { status: { in: IN_FLIGHT_ORDER_STATUSES } },
        },
      },
      select: { branchId: true },
      distinct: ['branchId'],
    });
    const live = new Set(
      driversWithActive
        .map((u) => u.branchId)
        .filter((id): id is string => id != null),
    );
    const all = await this.prisma.branch.findMany({
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    return {
      branches: all.map((b) => ({
        branchId: b.id,
        isLive: live.has(b.id),
      })),
    };
  }
}
