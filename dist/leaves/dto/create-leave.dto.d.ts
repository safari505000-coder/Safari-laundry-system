import { LeaveType } from '@prisma/client';
export declare class CreateLeaveDto {
    type: LeaveType;
    startDate: string;
    endDate: string;
    reason?: string;
}
export declare class RejectLeaveDto {
    reason: string;
}
