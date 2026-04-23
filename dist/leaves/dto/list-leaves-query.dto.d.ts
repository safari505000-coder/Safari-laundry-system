import { LeaveStatus, LeaveType } from '@prisma/client';
export declare class ListLeavesQueryDto {
    status?: LeaveStatus;
    type?: LeaveType;
    userId?: string;
    from?: string;
    to?: string;
}
