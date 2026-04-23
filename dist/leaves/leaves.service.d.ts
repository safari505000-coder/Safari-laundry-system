import { Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLeaveDto } from './dto/create-leave.dto';
import type { ListLeavesQueryDto } from './dto/list-leaves-query.dto';
export type LeaveRow = Prisma.LeaveRequestGetPayload<{
    include: {
        user: {
            select: {
                id: true;
                fullName: true;
                username: true;
                employeeId: true;
                civilId: true;
                jobTitle: true;
                branch: {
                    select: {
                        id: true;
                        name: true;
                    };
                };
            };
        };
        approvedBy: {
            select: {
                id: true;
                fullName: true;
                username: true;
            };
        };
    };
}>;
export declare class LeavesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(actorUserId: string, dto: CreateLeaveDto): Promise<LeaveRow>;
    list(actorRole: SafariRole, actorUserId: string, q: ListLeavesQueryDto): Promise<LeaveRow[]>;
    listMine(actorUserId: string): Promise<LeaveRow[]>;
    findOne(actorRole: SafariRole, actorUserId: string, id: string): Promise<LeaveRow>;
    approve(actorRole: SafariRole, actorUserId: string, id: string): Promise<LeaveRow>;
    reject(actorRole: SafariRole, actorUserId: string, id: string, reason: string): Promise<LeaveRow>;
    cancel(actorUserId: string, id: string): Promise<LeaveRow>;
}
