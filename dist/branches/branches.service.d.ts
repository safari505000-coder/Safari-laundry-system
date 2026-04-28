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
        isActive: boolean;
        phone: string | null;
        location: string;
        isAdministrative: boolean;
        payrollRosterSortOrder: number | null;
    }[]>;
    createFromBody(body: unknown): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        isActive: boolean;
        phone: string | null;
        location: string;
        isAdministrative: boolean;
        payrollRosterSortOrder: number | null;
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
        isActive: boolean;
        phone: string | null;
        location: string;
        isAdministrative: boolean;
        payrollRosterSortOrder: number | null;
    }>;
    update(id: string, dto: {
        name?: string;
        location?: string;
        phone?: string;
        isActive?: boolean;
        isAdministrative?: boolean;
        payrollRosterSortOrder?: number | null;
    }): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        isActive: boolean;
        phone: string | null;
        location: string;
        isAdministrative: boolean;
        payrollRosterSortOrder: number | null;
    }>;
    updateFromBody(id: string, body: unknown): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        isActive: boolean;
        phone: string | null;
        location: string;
        isAdministrative: boolean;
        payrollRosterSortOrder: number | null;
    }>;
    operationsLiveByBranch(): Promise<{
        branches: {
            branchId: string;
            branchName: string;
            isLive: boolean;
        }[];
    }>;
}
