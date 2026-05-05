import { AttendanceSource } from "@prisma/client";
export declare class ListAttendanceQueryDto {
    from?: string;
    to?: string;
    userId?: string;
    branchId?: string;
    source?: AttendanceSource;
}
