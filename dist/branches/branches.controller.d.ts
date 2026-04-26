import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { BranchesService } from './branches.service';
export declare class BranchesController {
    private readonly branchesService;
    constructor(branchesService: BranchesService);
    list(user: JwtUser): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
        isAdministrative: boolean;
    }[]>;
    create(body: unknown): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
        isAdministrative: boolean;
    }>;
    update(id: string, body: unknown): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
        isAdministrative: boolean;
    }>;
    operationsLive(): Promise<{
        branches: {
            branchId: string;
            isLive: boolean;
        }[];
    }>;
}
