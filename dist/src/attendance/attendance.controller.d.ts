import { AttendanceService } from './attendance.service';
import { BiometricEventDto } from './dto/biometric-event.dto';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import { ManualAttendanceDto } from './dto/manual-attendance.dto';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
export declare class AttendanceController {
    private readonly attendance;
    constructor(attendance: AttendanceService);
    list(q: ListAttendanceQueryDto): Promise<import("./attendance.service").AttendanceRowDto[]>;
    manual(dto: ManualAttendanceDto, user: JwtUser): Promise<import("./attendance.service").AttendanceRowDto>;
    sync(from: string, to: string): Promise<{
        count: number;
    }>;
    biometric(dto: BiometricEventDto): Promise<import("./attendance.service").AttendanceRowDto>;
}
