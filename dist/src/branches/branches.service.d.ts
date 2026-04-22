import { PrismaService } from '../prisma/prisma.service';
export declare class BranchesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listAll(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        updatedAt: Date;
        name: string;
        location: string;
        phone: string | null;
        isActive: boolean;
    }[]>;
    create(dto: {
        name: string;
        location: string;
        phone?: string;
        isActive?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        location: string;
        phone: string | null;
        isActive: boolean;
    }>;
    operationsLiveByBranch(): Promise<{
        branches: {
            branchId: string;
            isLive: boolean;
        }[];
    }>;
}
