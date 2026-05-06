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
                name: string;
                id: string;
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
        status: import(".prisma/client").$Enums.LeaveStatus;
        userId: string;
        type: import(".prisma/client").$Enums.LeaveType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        startDate: Date;
        endDate: Date;
        approvedById: string | null;
        approvedAt: Date | null;
        daysCount: number;
        rejectedReason: string | null;
    }>;
    list(q: ListLeavesQueryDto, user: JwtUser): Promise<({
        user: {
            branch: {
                name: string;
                id: string;
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
        status: import(".prisma/client").$Enums.LeaveStatus;
        userId: string;
        type: import(".prisma/client").$Enums.LeaveType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        startDate: Date;
        endDate: Date;
        approvedById: string | null;
        approvedAt: Date | null;
        daysCount: number;
        rejectedReason: string | null;
    })[]>;
    mine(user: JwtUser): Promise<({
        user: {
            branch: {
                name: string;
                id: string;
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
        status: import(".prisma/client").$Enums.LeaveStatus;
        userId: string;
        type: import(".prisma/client").$Enums.LeaveType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        startDate: Date;
        endDate: Date;
        approvedById: string | null;
        approvedAt: Date | null;
        daysCount: number;
        rejectedReason: string | null;
    })[]>;
    findOne(id: string, user: JwtUser): Promise<{
        user: {
            branch: {
                name: string;
                id: string;
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
        status: import(".prisma/client").$Enums.LeaveStatus;
        userId: string;
        type: import(".prisma/client").$Enums.LeaveType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        startDate: Date;
        endDate: Date;
        approvedById: string | null;
        approvedAt: Date | null;
        daysCount: number;
        rejectedReason: string | null;
    }>;
    approve(id: string, user: JwtUser): Promise<{
        user: {
            branch: {
                name: string;
                id: string;
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
        status: import(".prisma/client").$Enums.LeaveStatus;
        userId: string;
        type: import(".prisma/client").$Enums.LeaveType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        startDate: Date;
        endDate: Date;
        approvedById: string | null;
        approvedAt: Date | null;
        daysCount: number;
        rejectedReason: string | null;
    }>;
    reject(id: string, dto: RejectLeaveDto, user: JwtUser): Promise<{
        user: {
            branch: {
                name: string;
                id: string;
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
        status: import(".prisma/client").$Enums.LeaveStatus;
        userId: string;
        type: import(".prisma/client").$Enums.LeaveType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        startDate: Date;
        endDate: Date;
        approvedById: string | null;
        approvedAt: Date | null;
        daysCount: number;
        rejectedReason: string | null;
    }>;
    cancel(id: string, user: JwtUser): Promise<{
        user: {
            branch: {
                name: string;
                id: string;
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
        status: import(".prisma/client").$Enums.LeaveStatus;
        userId: string;
        type: import(".prisma/client").$Enums.LeaveType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string | null;
        startDate: Date;
        endDate: Date;
        approvedById: string | null;
        approvedAt: Date | null;
        daysCount: number;
        rejectedReason: string | null;
    }>;
}
