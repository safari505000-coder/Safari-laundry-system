import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeaveStatus,
  LeaveType,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLeaveDto } from './dto/create-leave.dto';
import type { ListLeavesQueryDto } from './dto/list-leaves-query.dto';

export type LeaveRow = Prisma.LeaveRequestGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        fullName: true;
        username: true;
        employeeId: true;
        civilId: true;
        jobTitle: true;
        branch: { select: { id: true; name: true } };
      };
    };
    approvedBy: {
      select: { id: true; fullName: true; username: true };
    };
  };
}>;

const LEAVE_INCLUDE = {
  user: {
    select: {
      id: true,
      fullName: true,
      username: true,
      employeeId: true,
      civilId: true,
      jobTitle: true,
      branch: { select: { id: true, name: true } },
    },
  },
  approvedBy: {
    select: { id: true, fullName: true, username: true },
  },
} satisfies Prisma.LeaveRequestInclude;

function isApprover(role: SafariRole): boolean {
  return (
    role === SafariRole.OWNER ||
    role === SafariRole.GENERAL_MANAGER ||
    role === SafariRole.MANAGER ||
    role === SafariRole.ACCOUNTANT
  );
}

function diffDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / (24 * 60 * 60 * 1000)) + 1);
}

/**
 * Stage-D leave workflow service.
 *
 * Create → PENDING → APPROVED / REJECTED / CANCELLED. Approvers
 * (OWNER / GM / MANAGER / ACCOUNTANT) act on other users' requests;
 * employees can create + cancel their own while PENDING.
 */
@Injectable()
export class LeavesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actorUserId: string, dto: CreateLeaveDto): Promise<LeaveRow> {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid dates');
    }
    if (end < start) {
      throw new BadRequestException('endDate must be on/after startDate');
    }
    const row = await this.prisma.leaveRequest.create({
      data: {
        userId: actorUserId,
        type: dto.type as LeaveType,
        startDate: start,
        endDate: end,
        daysCount: diffDays(start, end),
        reason: dto.reason ?? null,
        status: LeaveStatus.PENDING,
      },
      include: LEAVE_INCLUDE,
    });
    return row;
  }

  async list(
    actorRole: SafariRole,
    actorUserId: string,
    q: ListLeavesQueryDto,
  ): Promise<LeaveRow[]> {
    const where: Prisma.LeaveRequestWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.from || q.to
        ? {
            startDate: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    if (!isApprover(actorRole)) {
      where.userId = actorUserId;
    }
    return this.prisma.leaveRequest.findMany({
      where,
      include: LEAVE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async listMine(actorUserId: string): Promise<LeaveRow[]> {
    return this.prisma.leaveRequest.findMany({
      where: { userId: actorUserId },
      include: LEAVE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(
    actorRole: SafariRole,
    actorUserId: string,
    id: string,
  ): Promise<LeaveRow> {
    const row = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: LEAVE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Leave request not found');
    if (!isApprover(actorRole) && row.userId !== actorUserId) {
      throw new ForbiddenException();
    }
    return row;
  }

  async approve(
    actorRole: SafariRole,
    actorUserId: string,
    id: string,
  ): Promise<LeaveRow> {
    if (!isApprover(actorRole)) throw new ForbiddenException();
    const current = await this.prisma.leaveRequest.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Leave request not found');
    if (current.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be approved');
    }
    return this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveStatus.APPROVED,
        approvedById: actorUserId,
        approvedAt: new Date(),
      },
      include: LEAVE_INCLUDE,
    });
  }

  async reject(
    actorRole: SafariRole,
    actorUserId: string,
    id: string,
    reason: string,
  ): Promise<LeaveRow> {
    if (!isApprover(actorRole)) throw new ForbiddenException();
    const current = await this.prisma.leaveRequest.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Leave request not found');
    if (current.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be rejected');
    }
    return this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveStatus.REJECTED,
        approvedById: actorUserId,
        approvedAt: new Date(),
        rejectedReason: reason,
      },
      include: LEAVE_INCLUDE,
    });
  }

  async cancel(actorUserId: string, id: string): Promise<LeaveRow> {
    const current = await this.prisma.leaveRequest.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Leave request not found');
    if (current.userId !== actorUserId) throw new ForbiddenException();
    if (current.status !== LeaveStatus.PENDING) {
      throw new BadRequestException(
        'Only your own PENDING request can be cancelled',
      );
    }
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: LeaveStatus.CANCELLED },
      include: LEAVE_INCLUDE,
    });
  }
}
