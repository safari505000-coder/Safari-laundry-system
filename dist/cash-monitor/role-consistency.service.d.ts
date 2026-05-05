import { SafariRole } from "@prisma/client";
import { PrismaService } from '../prisma/prisma.service';
export type RoleConsistencyMismatch = {
    userId: string;
    username: string;
    fullName: string;
    safariRole: SafariRole;
    roleName: string | null;
    branchId: string | null;
    isActive: boolean;
};
export type RoleConsistencyReport = {
    status: 'PASS' | 'FAIL';
    totalActiveUsers: number;
    mismatches: RoleConsistencyMismatch[];
    generatedAt: string;
};
export declare class RoleConsistencyService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    run(): Promise<RoleConsistencyReport>;
}
