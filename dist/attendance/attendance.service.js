"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AttendanceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttendanceService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const kuwait_time_1 = require("../common/time/kuwait-time");
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
};
let AttendanceService = AttendanceService_1 = class AttendanceService {
    prisma;
    logger = new common_1.Logger(AttendanceService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async syncShiftAttendance() {
        const yesterdayMidnight = new Date((0, kuwait_time_1.kuwaitMidnightUtc)(new Date()).getTime() - 24 * 60 * 60 * 1000);
        const todayMidnight = (0, kuwait_time_1.kuwaitMidnightUtc)(new Date());
        try {
            const count = await this.syncAttendanceFromShiftsInRange(yesterdayMidnight, todayMidnight);
            this.logger.log(`Attendance sync: ${count} rows upserted for ${yesterdayMidnight
                .toISOString()
                .slice(0, 10)}`);
        }
        catch (e) {
            this.logger.error(`Attendance sync failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    async syncAttendanceFromShiftsInRange(from, to) {
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
            const date = new Date((0, kuwait_time_1.kuwaitMidnightUtc)(s.startedAt));
            const endedAt = s.status === client_1.ShiftStatus.CLOSED && s.endedAt ? s.endedAt : null;
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
                    source: client_1.AttendanceSource.SHIFT_AUTO,
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
    async triggerSync(fromIso, toIso) {
        const from = new Date(fromIso);
        const to = new Date(toIso);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new common_1.BadRequestException('Invalid date range');
        }
        const count = await this.syncAttendanceFromShiftsInRange(from, to);
        return { count };
    }
    async list(q) {
        const to = q.to ? new Date(q.to) : new Date();
        const from = q.from
            ? new Date(q.from)
            : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
        const where = {
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
    async upsertManual(actorRole, dto) {
        if (actorRole !== client_1.SafariRole.OWNER &&
            actorRole !== client_1.SafariRole.GENERAL_MANAGER &&
            actorRole !== client_1.SafariRole.MANAGER &&
            actorRole !== client_1.SafariRole.ACCOUNTANT) {
            throw new common_1.BadRequestException('Role cannot edit attendance');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: dto.userId },
            select: { id: true, branchId: true },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const date = this.toLogicalDate(dto.date);
        const row = await this.prisma.attendanceLog.upsert({
            where: { userId_date: { userId: dto.userId, date } },
            create: {
                userId: dto.userId,
                branchId: user.branchId,
                date,
                checkInAt: dto.checkInAt ? new Date(dto.checkInAt) : null,
                checkOutAt: dto.checkOutAt ? new Date(dto.checkOutAt) : null,
                source: client_1.AttendanceSource.MANUAL,
                note: dto.note ?? null,
            },
            update: {
                ...(dto.checkInAt ? { checkInAt: new Date(dto.checkInAt) } : {}),
                ...(dto.checkOutAt
                    ? { checkOutAt: new Date(dto.checkOutAt) }
                    : {}),
                source: client_1.AttendanceSource.MANUAL,
                note: dto.note ?? null,
            },
            include: ATTENDANCE_INCLUDE,
        });
        return this.serialize(row);
    }
    async recordBiometricEvent(dto) {
        if (!dto.civilId && !dto.externalUserRef) {
            throw new common_1.BadRequestException('civilId or externalUserRef is required');
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
            throw new common_1.NotFoundException('No Safari Omni user matches the device payload');
        }
        const at = new Date(dto.atIso);
        const date = new Date((0, kuwait_time_1.kuwaitMidnightUtc)(at));
        const existing = await this.prisma.attendanceLog.findUnique({
            where: { userId_date: { userId: user.id, date } },
        });
        const next = {
            source: client_1.AttendanceSource.BIOMETRIC,
            externalRef: dto.deviceId,
            note: dto.meta ?? undefined,
        };
        if (dto.action === 'CHECK_IN') {
            next.checkInAt = at;
        }
        else {
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
                source: client_1.AttendanceSource.BIOMETRIC,
                externalRef: dto.deviceId,
                note: dto.meta ?? null,
            },
            update: next,
            include: ATTENDANCE_INCLUDE,
        });
        this.logger.log(`biometric ${dto.action} device=${dto.deviceId} user=${user.id} existed=${existing != null}`);
        return this.serialize(row);
    }
    toLogicalDate(ymd) {
        const parts = ymd.split('T')[0].split('-').map((x) => Number.parseInt(x, 10));
        if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
            throw new common_1.BadRequestException('date must be YYYY-MM-DD');
        }
        return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0) - 180 * 60_000);
    }
    serialize(r) {
        const duration = r.checkInAt && r.checkOutAt
            ? Math.max(0, Math.round((r.checkOutAt.getTime() - r.checkInAt.getTime()) / 60_000))
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
};
exports.AttendanceService = AttendanceService;
__decorate([
    (0, schedule_1.Cron)('5 21 * * *', { timeZone: 'Asia/Kuwait' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AttendanceService.prototype, "syncShiftAttendance", null);
exports.AttendanceService = AttendanceService = AttendanceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AttendanceService);
//# sourceMappingURL=attendance.service.js.map