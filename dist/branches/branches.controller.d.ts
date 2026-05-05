import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { BranchesService } from './branches.service';
export declare class BranchesController {
    private readonly branchesService;
    constructor(branchesService: BranchesService);
    list(user: JwtUser): import(".prisma/client").Prisma.PrismaPromise<{
        name: string;
        id: string;
        phone: string | null;
        isActive: boolean;
        updatedAt: Date;
        location: string;
        isAdministrative: boolean;
        payrollRosterSortOrder: number | null;
    }[]>;
    create(body: unknown): Promise<{
        name: string;
        id: string;
        phone: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        isAdministrative: boolean;
        payrollRosterSortOrder: number | null;
    }>;
    update(id: string, body: unknown): Promise<{
        name: string;
        id: string;
        phone: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        isAdministrative: boolean;
        payrollRosterSortOrder: number | null;
    }>;
    operationsLive(): Promise<{
        branches: {
            branchId: string;
            branchName: string;
            isLive: boolean;
        }[];
    }>;
}
