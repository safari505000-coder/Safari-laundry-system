import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchesService } from './branches.service';
export declare class BranchesController {
    private readonly branchesService;
    constructor(branchesService: BranchesService);
    list(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
    }[]>;
    create(dto: CreateBranchDto): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
    }>;
    update(id: string, dto: UpdateBranchDto): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
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
