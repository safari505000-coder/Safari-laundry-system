import { CreateBranchDto } from './dto/create-branch.dto';
import { BranchesService } from './branches.service';
export declare class BranchesController {
    private readonly branchesService;
    constructor(branchesService: BranchesService);
    list(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        updatedAt: Date;
        name: string;
        location: string;
        phone: string | null;
        isActive: boolean;
    }[]>;
    create(dto: CreateBranchDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        location: string;
        phone: string | null;
        isActive: boolean;
    }>;
    operationsLive(): Promise<{
        branches: {
            branchId: string;
            isLive: boolean;
        }[];
    }>;
}
