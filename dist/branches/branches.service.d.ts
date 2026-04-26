import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare class BranchesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private branchListSelect;
    listForRole(actorRole: string): Prisma.PrismaPromise<{
        id: string;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
        isAdministrative: boolean;
    }[]>;
    createFromBody(body: unknown): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
        isAdministrative: boolean;
    }>;
    create(dto: {
        name: string;
        location: string;
        phone?: string;
        isActive?: boolean;
        isAdministrative?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
        isAdministrative: boolean;
    }>;
    update(id: string, dto: {
        name?: string;
        location?: string;
        phone?: string;
        isActive?: boolean;
        isAdministrative?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
        isAdministrative: boolean;
    }>;
    updateFromBody(id: string, body: unknown): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        phone: string | null;
        isActive: boolean;
        location: string;
        isAdministrative: boolean;
    }>;
    operationsLiveByBranch(): Promise<{
        branches: {
            branchId: string;
            isLive: boolean;
        }[];
    }>;
}
