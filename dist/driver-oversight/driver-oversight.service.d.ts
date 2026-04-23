import { PrismaService } from '../prisma/prisma.service';
export type DriverOversightShiftStatus = 'ON_SHIFT' | 'OFF';
export type DriverOversightCard = {
    driverId: string;
    fullName: string;
    username: string;
    phone: string | null;
    branch: {
        id: string;
        name: string;
    } | null;
    shiftStatus: DriverOversightShiftStatus;
    shiftStartedAt: string | null;
    ordersTodayCount: number;
    cashTodayKd: string;
    pendingInvoicesCount: number;
    heldCashKd: string;
    staleQuickCount: number;
    staleQuickKd: string;
    atRisk: boolean;
};
export declare class DriverOversightService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listForBranchManager(branchId: string | null): Promise<DriverOversightCard[]>;
    listForAllBranches(): Promise<DriverOversightCard[]>;
    private buildCards;
}
