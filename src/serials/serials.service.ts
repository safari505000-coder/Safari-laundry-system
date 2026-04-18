import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SerialCounterService } from './serial-counter.service';
import type {
  DriverPrefixRowDto,
  SerialLogDto,
  SerialLogRowDto,
} from './dto/serials.dto';

/**
 * Dastur §1 (V1.5) — Owner operations for the serial management island.
 *
 * 1. list drivers + currently-assigned prefixes (plus unassigned ones);
 * 2. set/clear a prefix on a specific driver (uniqueness DB-enforced);
 * 3. read the recent serial log for the audit view.
 */
@Injectable()
export class SerialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly counter: SerialCounterService,
  ) {}

  async listDrivers(): Promise<DriverPrefixRowDto[]> {
    const users = await this.prisma.user.findMany({
      where: { safariRole: SafariRole.DRIVER },
      select: {
        id: true,
        fullName: true,
        username: true,
        driverPrefix: true,
        isActive: true,
        branch: { select: { name: true } },
      },
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
    });
    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      username: u.username,
      driverPrefix: u.driverPrefix,
      branchName: u.branch?.name ?? null,
      isActive: u.isActive,
    }));
  }

  async setDriverPrefix(
    userId: string,
    rawPrefix: string | null | undefined,
  ): Promise<DriverPrefixRowDto> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { safariRole: true },
    });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.safariRole !== SafariRole.DRIVER) {
      throw new BadRequestException('Only DRIVER users can receive a prefix');
    }

    const normalised =
      typeof rawPrefix === 'string' && rawPrefix.trim().length > 0
        ? rawPrefix.trim().toUpperCase()
        : null;

    if (normalised !== null && !/^[A-Z]$/.test(normalised)) {
      throw new BadRequestException(
        'driverPrefix must be a single uppercase letter A-Z',
      );
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { driverPrefix: normalised },
        select: {
          id: true,
          fullName: true,
          username: true,
          driverPrefix: true,
          isActive: true,
          branch: { select: { name: true } },
        },
      });
      return {
        id: updated.id,
        fullName: updated.fullName,
        username: updated.username,
        driverPrefix: updated.driverPrefix,
        branchName: updated.branch?.name ?? null,
        isActive: updated.isActive,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `Prefix "${normalised}" is already assigned to another driver`,
        );
      }
      throw err;
    }
  }

  async getSerialLog(limit = 50): Promise<SerialLogDto> {
    const take = Math.min(Math.max(limit, 1), 200);
    const [rowsRaw, counter] = await Promise.all([
      this.prisma.order.findMany({
        where: { serialNumber: { not: null } },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          serialNumber: true,
          driverId: true,
          totalPrice: true,
          createdAt: true,
          customer: { select: { displayName: true, phone: true } },
          driver: {
            select: {
              fullName: true,
              username: true,
              driverPrefix: true,
            },
          },
        },
      }),
      this.counter.peek(),
    ]);

    const rows: SerialLogRowDto[] = rowsRaw.map((o) => ({
      orderId: o.id,
      serialNumber: o.serialNumber!,
      driverId: o.driverId,
      driverName: o.driver?.fullName ?? o.driver?.username ?? null,
      driverPrefix: o.driver?.driverPrefix ?? null,
      customerName:
        o.customer?.displayName?.trim() ||
        o.customer?.phone?.trim() ||
        null,
      totalPriceKd: o.totalPrice.toString(),
      createdAtIso: o.createdAt.toISOString(),
    }));

    return { currentCounter: counter, rows };
  }
}
