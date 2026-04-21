import { PrismaService } from '../prisma/prisma.service';
export declare class BranchesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listAll(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        updatedAt: Date;
        isActive: boolean;
        name: string;
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
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        name: string;
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
