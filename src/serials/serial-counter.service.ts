import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dastur §1 (V1.5) + V19.24 — Per-operator serial counter.
 *
 * `Order.serialNumber` is composed as `<driverPrefix>-<N>` with **one
 * monotonic integer stream per issuing user** (driver, branch manager, etc.),
 * not a single global N across everyone. The legacy `ORDER_SERIAL` key
 * in `SerialCounter` is no longer used for stamping; each operator has
 * their own `OU_<userId>` row. This keeps e.g. `A-1`, `A-2`, `A-3` for
 * the same `A` user while a different `B` user can also have `B-1`
 * (unique is on the full `serialNumber` string, not the suffix alone).
 *
 * Before the first stamp after a deploy (or to absorb historical rows
 * issued under the old global counter), the service synchronises the
 * row's floor to `max(N)` parsed from that user's **existing** orders
 * with matching `<prefix>-<N>` so the next `increment` can never
 * collide.
 *
 * Atomicity: `update({ data: { value: { increment: 1 } } })` is compiled
 * to a `value = value + 1` UPDATE which Postgres executes under a row
 * lock, so parallel transactions for the *same* operator serialise. Two
 * different operators can stamp concurrently.
 */
@Injectable()
export class SerialCounterService {
  /** @deprecated Stamping now uses per-user keys only. Kept for old DBs. */
  private static readonly ORDER_SERIAL_KEY = 'ORDER_SERIAL';

  /**
   * Row key: `OU_` + user UUID. Must match `deleteMany` in reset-invoices
   * and `scanGaps` prefix filters.
   */
  static readonly USER_ORDER_KEY_PREFIX = 'OU_';

  constructor(private readonly prisma: PrismaService) {}

  static orderSerialKeyForUser(userId: string): string {
    return `${SerialCounterService.USER_ORDER_KEY_PREFIX}${userId}`;
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Largest `<N>` from existing `prefix-<N>` serials for this user.
   * Used to sync a fresh `SerialCounter` row with legacy (global) data.
   */
  private async maxSerialSuffixForOperator(
    tx: Prisma.TransactionClient,
    operatorId: string,
    prefix: string,
  ): Promise<number> {
    const rows = await tx.order.findMany({
      where: {
        driverId: operatorId,
        serialNumber: { startsWith: `${prefix}-` },
      },
      select: { serialNumber: true },
    });
    const re = new RegExp(`^${this.escapeRegex(prefix)}-(\\d+)$`);
    let maxN = 0;
    for (const r of rows) {
      if (!r.serialNumber) continue;
      const m = r.serialNumber.match(re);
      if (m) {
        const n = Number.parseInt(m[1], 10);
        if (Number.isFinite(n)) maxN = Math.max(maxN, n);
      }
    }
    return maxN;
  }

  /**
   * Stamp a fresh `<prefix>-<n>` where **n** is unique per `driverId` /
   * operator (V19.24). Return `null` when the user has no prefix — same as
   * before (legacy unblocked tickets).
   */
  async stampOrderSerial(
    tx: Prisma.TransactionClient,
    driverId: string | null | undefined,
  ): Promise<string | null> {
    if (!driverId) return null;

    const driver = await tx.user.findUnique({
      where: { id: driverId },
      select: { driverPrefix: true },
    });
    const prefix = driver?.driverPrefix?.trim();
    if (!prefix) return null;

    const key = SerialCounterService.orderSerialKeyForUser(driverId);
    const maxFromOrders = await this.maxSerialSuffixForOperator(
      tx,
      driverId,
      prefix,
    );
    const row = await tx.serialCounter.findUnique({
      where: { key },
      select: { value: true },
    });
    const current = row?.value ?? 0;
    const floor = Math.max(current, maxFromOrders);
    if (floor > current) {
      await tx.serialCounter.upsert({
        where: { key },
        create: { key, value: floor },
        update: { value: floor },
      });
    }

    const next = await this.incrementCounter(tx, key);
    return `${prefix}-${next}`;
  }

  /**
   * Low-level atomic bump. Uses upsert so a fresh environment (that skipped
   * the seed) still works. Returns the post-increment value.
   */
  async incrementCounter(
    tx: Prisma.TransactionClient,
    key: string,
  ): Promise<number> {
    const row = await tx.serialCounter.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    if (!Number.isFinite(row.value)) {
      throw new InternalServerErrorException(
        `SerialCounter "${key}" returned non-numeric value`,
      );
    }
    return row.value;
  }

  /**
   * Non-transactional read of a `SerialCounter` row (e.g. legacy
   * `ORDER_SERIAL` — not used for stamping after V19.24).
   */
  async peek(key = SerialCounterService.ORDER_SERIAL_KEY): Promise<number> {
    const row = await this.prisma.serialCounter.findUnique({
      where: { key },
      select: { value: true },
    });
    return row?.value ?? 0;
  }

  /** For Owner "serial log" — how many rows carry a stamped serial. */
  async countOrdersWithSerialNumber(): Promise<number> {
    return this.prisma.order.count({
      where: { serialNumber: { not: null } },
    });
  }

}
