import { CreateBranchDto } from './dto/create-branch.dto';
import { BranchesService } from './branches.service';
export declare class BranchesController {
    private readonly branchesService;
    constructor(branchesService: BranchesService);
    list(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        name: string;
        updatedAt: Date;
        isActive: boolean;
        phone: string | null;
        location: string;
    }[]>;
    create(dto: CreateBranchDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        phone: string | null;
        location: string;
    }>;
    operationsLive(): Promise<{
        branches: {
            branchId: string;
            isLive: boolean;
        }[];
    }>;
}
