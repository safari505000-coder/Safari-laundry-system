import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Kuwait-calendar-day aggregates for dispatch throughput / SLA (additive metrics).
 */
@Injectable()
export class DispatchMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  kuwaitCalendarDateUtc(d: Date): Date {
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuwait',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    const [y, m, day] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, day));
  }

  async incrementAssigned(driverId: string, at: Date): Promise<void> {
    const date = this.kuwaitCalendarDateUtc(at);
    await this.prisma.driverMetrics.upsert({
      where: { driverId_date: { driverId, date } },
      create: {
        driverId,
        date,
        assignedCount: 1,
      },
      update: {
        assignedCount: { increment: 1 },
      },
    });
  }

  async recordAcknowledged(
    driverId: string,
    at: Date,
    ackMinutes: number,
  ): Promise<void> {
    const date = this.kuwaitCalendarDateUtc(at);
    const existing = await this.prisma.driverMetrics.findUnique({
      where: { driverId_date: { driverId, date } },
    });

    const nextAckCount = (existing?.acknowledgedCount ?? 0) + 1;
    const prevAvg = existing?.avgAckMinutes ?? null;
    const nextAvgAck =
      nextAckCount === 1 || prevAvg == null ?
        ackMinutes
      : (prevAvg * (nextAckCount - 1) + ackMinutes) / nextAckCount;

    await this.prisma.driverMetrics.upsert({
      where: { driverId_date: { driverId, date } },
      create: {
        driverId,
        date,
        acknowledgedCount: 1,
        avgAckMinutes: ackMinutes,
      },
      update: {
        acknowledgedCount: { increment: 1 },
        avgAckMinutes: nextAvgAck,
      },
    });
  }

  async recordCompletion(input: {
    driverId: string;
    at: Date;
    totalMinutes: number;
  }): Promise<void> {
    const date = this.kuwaitCalendarDateUtc(input.at);

    let lateDelta = 0;
    let breachDelta = 0;
    if (input.totalMinutes > 5) breachDelta = 1;
    else if (input.totalMinutes > 2) lateDelta = 1;

    const existing = await this.prisma.driverMetrics.findUnique({
      where: { driverId_date: { driverId: input.driverId, date } },
    });

    const nextCompleted = (existing?.completedCount ?? 0) + 1;
    const prevTotAvg = existing?.avgTotalMinutes ?? null;
    const nextTotAvg =
      nextCompleted === 1 || prevTotAvg == null ?
        input.totalMinutes
      : (prevTotAvg * (nextCompleted - 1) + input.totalMinutes) /
        nextCompleted;

    await this.prisma.driverMetrics.upsert({
      where: { driverId_date: { driverId: input.driverId, date } },
      create: {
        driverId: input.driverId,
        date,
        completedCount: 1,
        lateCount: lateDelta,
        breachedCount: breachDelta,
        avgTotalMinutes: input.totalMinutes,
      },
      update: {
        completedCount: { increment: 1 },
        lateCount: { increment: lateDelta },
        breachedCount: { increment: breachDelta },
        avgTotalMinutes: nextTotAvg,
      },
    });
  }
}
