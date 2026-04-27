import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canSeeAdministrativeBranches } from './administrative-branch.util';

const IN_FLIGHT_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PICKED_UP,
  OrderStatus.IN_PROGRESS,
  OrderStatus.OUT_FOR_DELIVERY,
];

const CREATE_BRANCH_KEYS = new Set([
  'name',
  'location',
  'phone',
  'isActive',
  'isAdministrative',
]);

/** Integer or null for optional roster sort; undefined = omit from patch. */
function readOptionalSortOrder(
  v: unknown,
  field: string,
): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) {
    return Number.parseInt(v.trim(), 10);
  }
  throw new BadRequestException(`${field} must be an integer or null`);
}

function assertPlainObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('Invalid JSON body');
  }
  return raw as Record<string, unknown>;
}

/** Accepts boolean or common JSON/string forms from clients. */
function readBooleanField(
  v: unknown,
  field: string,
): boolean | undefined {
  if (v === undefined) return undefined;
  if (v === true || v === false) return v;
  if (v === 'true' || v === 'false') return v === 'true';
  if (v === 1 || v === 0) return v === 1;
  throw new BadRequestException(`${field} must be a boolean`);
}

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  private branchListSelect = {
    id: true,
    name: true,
    location: true,
    phone: true,
    isActive: true,
    isAdministrative: true,
    payrollRosterSortOrder: true,
    updatedAt: true,
  } as const;

  /**
   * Full branch list for OWNER / GENERAL_MANAGER / ACCOUNTANT.
   * Other roles never see `isAdministrative` branches (HQ cost center).
   */
  listForRole(actorRole: string) {
    return this.prisma.branch.findMany({
      where: canSeeAdministrativeBranches(actorRole)
        ? {}
        : { isAdministrative: false },
      orderBy: [
        { payrollRosterSortOrder: { sort: 'asc', nulls: 'last' } },
        { name: 'asc' },
      ],
      select: this.branchListSelect,
    });
  }

  /**
   * Bypasses global `ValidationPipe` class validation so `isAdministrative`
   * (and booleans) always parse correctly even when DTO metadata is stale
   * in the running process or clients send slightly loose JSON.
   */
  createFromBody(body: unknown) {
    const o = assertPlainObject(body);
    for (const key of Object.keys(o)) {
      if (!CREATE_BRANCH_KEYS.has(key)) {
        throw new BadRequestException(`property ${key} should not exist`);
      }
    }
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const location = typeof o.location === 'string' ? o.location.trim() : '';
    if (!name) {
      throw new BadRequestException('Branch name is required');
    }
    if (name.length > 200) {
      throw new BadRequestException('Branch name is too long');
    }
    if (!location) {
      throw new BadRequestException('Branch location is required');
    }
    if (location.length > 500) {
      throw new BadRequestException('Branch location is too long');
    }
    let phone: string | undefined;
    if (o.phone !== undefined && o.phone !== null) {
      if (typeof o.phone !== 'string') {
        throw new BadRequestException('phone must be a string');
      }
      phone = o.phone.trim();
      if (phone.length > 40) {
        throw new BadRequestException('phone is too long');
      }
    }
    const isActive = readBooleanField(o.isActive, 'isActive');
    const isAdministrative = readBooleanField(
      o.isAdministrative,
      'isAdministrative',
    );
    return this.create({
      name,
      location,
      phone,
      isActive,
      isAdministrative,
    });
  }

  async create(dto: {
    name: string;
    location: string;
    phone?: string;
    isActive?: boolean;
    isAdministrative?: boolean;
  }) {
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
      isAdministrative?: boolean;
      payrollRosterSortOrder?: number | null;
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
    if (dto.isAdministrative !== undefined) {
      if (dto.isAdministrative === true) {
        const assigned = await this.prisma.user.count({
          where: { branchId: id },
        });
        if (assigned > 0) {
          throw new BadRequestException(
            'Cannot mark branch as administrative while users are still assigned to it. Reassign staff first.',
          );
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

  /** Same rationale as `createFromBody` — reliable PATCH parsing for toggles. */
  updateFromBody(id: string, body: unknown) {
    const o = assertPlainObject(body);
    const patch: {
      name?: string;
      location?: string;
      phone?: string;
      isActive?: boolean;
      isAdministrative?: boolean;
      payrollRosterSortOrder?: number | null;
    } = {};
    if ('name' in o) {
      if (typeof o.name !== 'string') {
        throw new BadRequestException('name must be a string');
      }
      patch.name = o.name;
    }
    if ('location' in o) {
      if (typeof o.location !== 'string') {
        throw new BadRequestException('location must be a string');
      }
      patch.location = o.location;
    }
    if ('phone' in o) {
      if (o.phone === null) {
        patch.phone = '';
      } else if (typeof o.phone === 'string') {
        patch.phone = o.phone;
      } else {
        throw new BadRequestException('phone must be a string');
      }
    }
    if ('isActive' in o) {
      const b = readBooleanField(o.isActive, 'isActive');
      if (b === undefined) {
        throw new BadRequestException('isActive must be a boolean');
      }
      patch.isActive = b;
    }
    if ('isAdministrative' in o) {
      const b = readBooleanField(o.isAdministrative, 'isAdministrative');
      if (b === undefined) {
        throw new BadRequestException('isAdministrative must be a boolean');
      }
      patch.isAdministrative = b;
    }
    if ('payrollRosterSortOrder' in o) {
      patch.payrollRosterSortOrder = readOptionalSortOrder(
        o.payrollRosterSortOrder,
        'payrollRosterSortOrder',
      );
    }
    const unknown = Object.keys(o).filter(
      (k) =>
        ![
          'name',
          'location',
          'phone',
          'isActive',
          'isAdministrative',
          'payrollRosterSortOrder',
        ].includes(k),
    );
    if (unknown.length) {
      throw new BadRequestException(
        `property ${unknown[0]} should not exist`,
      );
    }
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Send at least one field to update');
    }
    return this.update(id, patch);
  }

  /** Branches with at least one in-flight order assigned to a driver at that branch. */
  async operationsLiveByBranch(): Promise<{
    branches: { branchId: string; branchName: string; isLive: boolean }[];
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
}
