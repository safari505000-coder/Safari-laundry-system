import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dastur §1 (V1.5) — Atomic global counter service.
 *
 * The only consumer today is Order.serialNumber but the service is generic:
 * any feature can claim a counter key and receive monotonically increasing
 * integers safe for concurrent use. The underlying table (`SerialCounter`)
 * is seeded by the V1.5 migration with `{ key: "ORDER_SERIAL", value: 0 }`.
 *
 * Atomicity: `update({ data: { value: { increment: 1 } } })` is compiled to
 * a `value = value + 1` UPDATE which Postgres executes under a row-level
 * lock, so parallel transactions serialize cleanly. We always call it from
 * inside the caller's transaction so the counter bump is rolled back if
 * the surrounding order creation fails.
 */
@Injectable()
export class SerialCounterService {
  private static readonly ORDER_SERIAL_KEY = 'ORDER_SERIAL';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stamp a fresh `<prefix>-<counter>` serial for an order inside a
   * surrounding transaction. Returns `null` (and skips the counter bump)
   * when the driver has no prefix assigned — keeps legacy POS tickets
   * working without blocking.
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

    const next = await this.incrementCounter(tx, SerialCounterService.ORDER_SERIAL_KEY);
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

  /** Non-transactional read — current counter value, for the Owner log UI. */
  async peek(key = SerialCounterService.ORDER_SERIAL_KEY): Promise<number> {
    const row = await this.prisma.serialCounter.findUnique({
      where: { key },
      select: { value: true },
    });
    return row?.value ?? 0;
  }
}
