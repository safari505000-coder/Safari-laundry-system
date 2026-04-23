import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare class BranchesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listAll(): Prisma.PrismaPromise<{
        id: string;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
    }[]>;
    create(dto: {
        name: string;
        location: string;
        phone?: string;
        isActive?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
    }>;
    update(id: string, dto: {
        name?: string;
        location?: string;
        phone?: string;
        isActive?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
    }>;
    operationsLiveByBranch(): Promise<{
        branches: {
            branchId: string;
            isLive: boolean;
        }[];
    }>;
}
