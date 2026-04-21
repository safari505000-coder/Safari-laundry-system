import { CreateBranchDto } from './dto/create-branch.dto';
import { BranchesService } from './branches.service';
export declare class BranchesController {
    private readonly branchesService;
    constructor(branchesService: BranchesService);
    list(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        updatedAt: Date;
        isActive: boolean;
        name: string;
        phone: string | null;
        location: string;
    }[]>;
    create(dto: CreateBranchDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        name: string;
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
