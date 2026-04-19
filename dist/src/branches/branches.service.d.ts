import { PrismaService } from '../prisma/prisma.service';
export declare class BranchesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listAll(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        updatedAt: Date;
        name: string;
        location: string;
        isActive: boolean;
        phone: string | null;
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
        isActive: boolean;
        phone: string | null;
    }>;
    operationsLiveByBranch(): Promise<{
        branches: {
            branchId: string;
            isLive: boolean;
        }[];
    }>;
}
