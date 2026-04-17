import { CreateBranchDto } from './dto/create-branch.dto';
import { BranchesService } from './branches.service';
export declare class BranchesController {
    private readonly branchesService;
    constructor(branchesService: BranchesService);
    list(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        updatedAt: Date;
        name: string;
        phone: string | null;
        isActive: boolean;
        location: string;
    }[]>;
    create(dto: CreateBranchDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        phone: string | null;
        isActive: boolean;
        location: string;
    }>;
    operationsLive(): Promise<{
        branches: {
            branchId: string;
            isLive: boolean;
        }[];
    }>;
}
