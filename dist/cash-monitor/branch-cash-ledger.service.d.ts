import { PrismaService } from '../prisma/prisma.service';
export interface BranchCashLedgerRow {
    branchId: string;
    branchName: string;
    currentBranchCash: string;
    openBagCount: number;
    incomingKd: string | null;
    outgoingKd: string | null;
}
export interface BranchCashLedgerResponse {
    generatedAt: string;
    window: {
        from: string;
        to: string;
    } | null;
    branches: BranchCashLedgerRow[];
    unattributedCustodyKd: string;
    unattributedCustodyBagCount: number;
    unattributedDepositKd: string | null;
    totalCurrentBranchCash: string;
    readOnly: true;
    advisoryOnly: true;
}
export declare class BranchCashLedgerService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    project(opts?: {
        window?: {
            from: Date;
            to: Date;
        };
        branchId?: string;
    }): Promise<BranchCashLedgerResponse>;
}
