import { Prisma } from "@prisma/client";
import { PrismaService } from '../prisma/prisma.service';
export declare class BranchesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private branchListSelect;
    listForRole(actorRole: string): Prisma.PrismaPromise<{
        name: string;
        id: string;
        phone: string | null;
        isActive: boolean;
        updatedAt: Date;
        location: string;
        isAdministrative: boolean;
        payrollRosterSortOrder: number | null;
    }[]>;
    createFromBody(body: unknown): Promise<{
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
    create(dto: {
        name: string;
        location: string;
        phone?: string;
        isActive?: boolean;
        isAdministrative?: boolean;
    }): Promise<{
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
    update(id: string, dto: {
        name?: string;
        location?: string;
        phone?: string;
        isActive?: boolean;
        isAdministrative?: boolean;
        payrollRosterSortOrder?: number | null;
    }): Promise<{
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
    updateFromBody(id: string, body: unknown): Promise<{
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
    operationsLiveByBranch(): Promise<{
        branches: {
            branchId: string;
            branchName: string;
            isLive: boolean;
        }[];
    }>;
}
