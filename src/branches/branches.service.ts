import { Injectable } from '@nestjs/common';
import { OrderStatus, SafariRole } from '@prisma/client';
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
