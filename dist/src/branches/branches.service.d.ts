import { PrismaService } from '../prisma/prisma.service';
export declare class BranchesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listAll(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        name: string;
        updatedAt: Date;
        isActive: boolean;
        phone: string | null;
        location: string;
    }[]>;
    create(dto: {
        name: string;
        location: string;
        phone?: string;
        isActive?: boolean;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        phone: string | null;
        location: string;
    }>;
    operationsLiveByBranch(): Promise<{
        branches: {
            branchId: string;
            isLive: boolean;
        }[];
    }>;
}
