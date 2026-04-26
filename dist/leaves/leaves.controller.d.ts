import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CreateLeaveDto, RejectLeaveDto } from './dto/create-leave.dto';
import { ListLeavesQueryDto } from './dto/list-leaves-query.dto';
import { LeavesService } from './leaves.service';
export declare class LeavesController {
    private readonly leaves;
    constructor(leaves: LeavesService);
    create(dto: CreateLeaveDto, user: JwtUser): Promise<{
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        type: import("@prisma/client").$Enums.LeaveType;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LeaveStatus;
        reason: string | null;
        approvedAt: Date | null;
        approvedById: string | null;
        rejectedReason: string | null;
        startDate: Date;
        endDate: Date;
        daysCount: number;
    }>;
    list(q: ListLeavesQueryDto, user: JwtUser): Promise<({
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        type: import("@prisma/client").$Enums.LeaveType;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LeaveStatus;
        reason: string | null;
        approvedAt: Date | null;
        approvedById: string | null;
        rejectedReason: string | null;
        startDate: Date;
        endDate: Date;
        daysCount: number;
    })[]>;
    mine(user: JwtUser): Promise<({
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        type: import("@prisma/client").$Enums.LeaveType;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LeaveStatus;
        reason: string | null;
        approvedAt: Date | null;
        approvedById: string | null;
        rejectedReason: string | null;
        startDate: Date;
        endDate: Date;
        daysCount: number;
    })[]>;
    findOne(id: string, user: JwtUser): Promise<{
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        type: import("@prisma/client").$Enums.LeaveType;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LeaveStatus;
        reason: string | null;
        approvedAt: Date | null;
        approvedById: string | null;
        rejectedReason: string | null;
        startDate: Date;
        endDate: Date;
        daysCount: number;
    }>;
    approve(id: string, user: JwtUser): Promise<{
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        type: import("@prisma/client").$Enums.LeaveType;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LeaveStatus;
        reason: string | null;
        approvedAt: Date | null;
        approvedById: string | null;
        rejectedReason: string | null;
        startDate: Date;
        endDate: Date;
        daysCount: number;
    }>;
    reject(id: string, dto: RejectLeaveDto, user: JwtUser): Promise<{
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        type: import("@prisma/client").$Enums.LeaveType;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LeaveStatus;
        reason: string | null;
        approvedAt: Date | null;
        approvedById: string | null;
        rejectedReason: string | null;
        startDate: Date;
        endDate: Date;
        daysCount: number;
    }>;
    cancel(id: string, user: JwtUser): Promise<{
        user: {
            branch: {
                id: string;
                name: string;
            } | null;
            id: string;
            username: string;
            fullName: string;
            employeeId: string | null;
            jobTitle: string | null;
            civilId: string | null;
        };
        approvedBy: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        type: import("@prisma/client").$Enums.LeaveType;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.LeaveStatus;
        reason: string | null;
        approvedAt: Date | null;
        approvedById: string | null;
        rejectedReason: string | null;
        startDate: Date;
        endDate: Date;
        daysCount: number;
    }>;
}
