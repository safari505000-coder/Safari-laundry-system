import { AttendanceSource, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
    date: string;
    checkInAtIso: string | null;
    checkOutAtIso: string | null;
    durationMinutes: number | null;
    source: AttendanceSource;
    externalRef: string | null;
    note: string | null;
};
export declare class AttendanceService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    syncShiftAttendance(): Promise<void>;
    syncAttendanceFromShiftsInRange(from: Date, to: Date): Promise<number>;
    triggerSync(fromIso: string, toIso: string): Promise<{
        count: number;
    }>;
    list(q: ListAttendanceQueryDto): Promise<AttendanceRowDto[]>;
    upsertManual(actorRole: SafariRole, dto: ManualAttendanceDto): Promise<AttendanceRowDto>;
    recordBiometricEvent(dto: BiometricEventDto): Promise<AttendanceRowDto>;
    private toLogicalDate;
    private serialize;
}
