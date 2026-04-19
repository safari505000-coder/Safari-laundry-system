import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AttendanceSource,
  Prisma,
  SafariRole,
  ShiftStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { kuwaitMidnightUtc } from '../common/time/kuwait-time';
import type { BiometricEventDto } from './dto/biometric-event.dto';
import type { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import type { ManualAttendanceDto } from './dto/manual-attendance.dto';

export type AttendanceRowDto = {
  id: string;
  userId: string;
  userName: string;
  username: string;
  employeeId: string | null;
  branchId: string | null;
  branchName: string | null;
  /** Logical Kuwait-local date, YYYY-MM-DD. */
  date: string;
  checkInAtIso: string | null;
  checkOutAtIso: string | null;
  durationMinutes: number | null;
  source: AttendanceSource;
  externalRef: string | null;
  note: string | null;
};

type AttendanceRow = Prisma.AttendanceLogGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        fullName: true;
        username: true;
        employeeId: true;
      };
    };
    branch: { select: { id: true; name: true } };
  };
}>;

const ATTENDANCE_INCLUDE = {
  user: {
    select: {
      id: true,
      fullName: true,
      username: true,
      employeeId: true,
    },
  },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.AttendanceLogInclude;

/**
 * Stage-D — centralised attendance service.
 *
 * Three entry points:
 *   1. SHIFT_AUTO  — daily cron at 00:05 Kuwait time generates an
 *                    attendance row from every Shift that closed
 *                    yesterday. Idempotent via (userId, date) unique.
 *   2. BIOMETRIC   — POST /api/attendance/biometric stub accepts
 *                    events from a fingerprint/face-scan device and
 *                    upserts the matching row. The concrete vendor
 *                    driver is deferred (HR-BIO-001).
 *   3. MANUAL      — POST /api/attendance/manual lets OWNER / GM /
 *                    MANAGER create or correct a row for audits that
 *                    the automation missed.
 *
 * All rows use Kuwait-local logical dates so duplicate entries for the
 * same day are impossible regardless of device timezone.
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Daily cron — runs at 00:05 Kuwait time (21:05 UTC). */
  @Cron('5 21 * * *', { timeZone: 'Asia/Kuwait' })
  async syncShiftAttendance(): Promise<void> {
    const yesterdayMidnight = new Date(
      kuwaitMidnightUtc(new Date()).getTime() - 24 * 60 * 60 * 1000,
    );
    const todayMidnight = kuwaitMidnightUtc(new Date());
    try {
      const count = await this.syncAttendanceFromShiftsInRange(
        yesterdayMidnight,
        todayMidnight,
      );
      this.logger.log(
        `Attendance sync: ${count} rows upserted for ${yesterdayMidnight
          .toISOString()
          .slice(0, 10)}`,
      );
    } catch (e) {
      this.logger.error(
        `Attendance sync failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Seeds attendance rows from every Shift with `startedAt` inside
   * [from, to). Idempotent: re-running for the same window just
   * updates existing rows.
   */
  async syncAttendanceFromShiftsInRange(
    from: Date,
    to: Date,
  ): Promise<number> {
    const shifts = await this.prisma.shift.findMany({
      where: { startedAt: { gte: from, lt: to } },
      select: {
        id: true,
        driverId: true,
        startedAt: true,
        endedAt: true,
        status: true,
        driver: { select: { branchId: true } },
      },
    });
    let count = 0;
    for (const s of shifts) {
      const date = new Date(kuwaitMidnightUtc(s.startedAt));
      const endedAt =
        s.status === ShiftStatus.CLOSED && s.endedAt ? s.endedAt : null;
      await this.prisma.attendanceLog.upsert({
        where: {
          userId_date: { userId: s.driverId, date },
        },
        create: {
          userId: s.driverId,
          branchId: s.driver.branchId,
          date,
          checkInAt: s.startedAt,
          checkOutAt: endedAt,
          source: AttendanceSource.SHIFT_AUTO,
          externalRef: s.id,
        },
        update: {
          checkInAt: s.startedAt,
          checkOutAt: endedAt,
          branchId: s.driver.branchId,
          externalRef: s.id,
        },
      });
      count += 1;
    }
    return count;
  }

  /** Manual admin trigger — useful for back-filling a specific day. */
  async triggerSync(fromIso: string, toIso: string): Promise<{ count: number }> {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    const count = await this.syncAttendanceFromShiftsInRange(from, to);
    return { count };
  }

  async list(q: ListAttendanceQueryDto): Promise<AttendanceRowDto[]> {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from
      ? new Date(q.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const where: Prisma.AttendanceLogWhereInput = {
      date: { gte: from, lte: to },
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.branchId ? { branchId: q.branchId } : {}),
      ...(q.source ? { source: q.source } : {}),
    };
    const rows = await this.prisma.attendanceLog.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      include: ATTENDANCE_INCLUDE,
    });
    return rows.map((r) => this.serialize(r));
  }

  async upsertManual(
    actorRole: SafariRole,
    dto: ManualAttendanceDto,
  ): Promise<AttendanceRowDto> {
    if (
      actorRole !== SafariRole.OWNER &&
      actorRole !== SafariRole.GENERAL_MANAGER &&
      actorRole !== SafariRole.MANAGER &&
      actorRole !== SafariRole.ACCOUNTANT
    ) {
      throw new BadRequestException('Role cannot edit attendance');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, branchId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const date = this.toLogicalDate(dto.date);
    const row = await this.prisma.attendanceLog.upsert({
      where: { userId_date: { userId: dto.userId, date } },
      create: {
        userId: dto.userId,
        branchId: user.branchId,
        date,
        checkInAt: dto.checkInAt ? new Date(dto.checkInAt) : null,
        checkOutAt: dto.checkOutAt ? new Date(dto.checkOutAt) : null,
        source: AttendanceSource.MANUAL,
        note: dto.note ?? null,
      },
      update: {
        ...(dto.checkInAt ? { checkInAt: new Date(dto.checkInAt) } : {}),
        ...(dto.checkOutAt
          ? { checkOutAt: new Date(dto.checkOutAt) }
          : {}),
        source: AttendanceSource.MANUAL,
        note: dto.note ?? null,
      },
      include: ATTENDANCE_INCLUDE,
    });
    return this.serialize(row);
  }

  /**
   * Biometric device webhook stub. Resolves the employee either by
   * civilId (preferred) or an externalUserRef agreed with the device.
   * If no matching user exists we respond 404 so the device can alert
   * the operator. Otherwise an (userId, Kuwait date) row is upserted.
   */
  async recordBiometricEvent(
    dto: BiometricEventDto,
  ): Promise<AttendanceRowDto> {
    if (!dto.civilId && !dto.externalUserRef) {
      throw new BadRequestException(
        'civilId or externalUserRef is required',
      );
    }
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(dto.civilId ? [{ civilId: dto.civilId }] : []),
          ...(dto.externalUserRef
            ? [{ employeeId: dto.externalUserRef }]
            : []),
        ],
      },
      select: { id: true, branchId: true },
    });
    if (!user) {
      throw new NotFoundException(
        'No Safari Omni user matches the device payload',
      );
    }
    const at = new Date(dto.atIso);
    const date = new Date(kuwaitMidnightUtc(at));
    const existing = await this.prisma.attendanceLog.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    const next: Prisma.AttendanceLogUpdateInput = {
      source: AttendanceSource.BIOMETRIC,
      externalRef: dto.deviceId,
      note: dto.meta ?? undefined,
    };
    if (dto.action === 'CHECK_IN') {
      next.checkInAt = at;
    } else {
      next.checkOutAt = at;
    }
    const row = await this.prisma.attendanceLog.upsert({
      where: { userId_date: { userId: user.id, date } },
      create: {
        userId: user.id,
        branchId: user.branchId,
        date,
        checkInAt: dto.action === 'CHECK_IN' ? at : null,
        checkOutAt: dto.action === 'CHECK_OUT' ? at : null,
        source: AttendanceSource.BIOMETRIC,
        externalRef: dto.deviceId,
        note: dto.meta ?? null,
      },
      update: next,
      include: ATTENDANCE_INCLUDE,
    });
    this.logger.log(
      `biometric ${dto.action} device=${dto.deviceId} user=${user.id} existed=${existing != null}`,
    );
    return this.serialize(row);
  }

  // ─── helpers ────────────────────────────────────────────────────────
  private toLogicalDate(ymd: string): Date {
    const parts = ymd.split('T')[0].split('-').map((x) => Number.parseInt(x, 10));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    return new Date(
      Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0) - 180 * 60_000,
    );
  }

  private serialize(r: AttendanceRow): AttendanceRowDto {
    const duration =
      r.checkInAt && r.checkOutAt
        ? Math.max(
            0,
            Math.round(
              (r.checkOutAt.getTime() - r.checkInAt.getTime()) / 60_000,
            ),
          )
        : null;
    return {
      id: r.id,
      userId: r.userId,
      userName: r.user.fullName,
      username: r.user.username,
      employeeId: r.user.employeeId,
      branchId: r.branchId,
      branchName: r.branch?.name ?? null,
      date: r.date.toISOString().slice(0, 10),
      checkInAtIso: r.checkInAt?.toISOString() ?? null,
      checkOutAtIso: r.checkOutAt?.toISOString() ?? null,
      durationMinutes: duration,
      source: r.source,
      externalRef: r.externalRef,
      note: r.note,
    };
  }
}
