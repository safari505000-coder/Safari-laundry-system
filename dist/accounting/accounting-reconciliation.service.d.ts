import { PrismaService } from '../prisma/prisma.service';
import { CashReconciliationDto, CashResponsibilityDto, CashTimelineResponseDto } from './dto/cash-control.dto';
import { AccountingScopeType } from './dto/accounting-query.dto';
type CashScope = {
    scopeType?: AccountingScopeType | 'ALL' | 'BRANCH' | 'DRIVER';
    branchId?: string;
    driverId?: string;
};
export declare class AccountingReconciliationService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    computeCashReconciliation(day: string, scopeInput?: string | CashScope): Promise<CashReconciliationDto>;
    getCashTimeline(params: {
        date: string;
        scopeType?: AccountingScopeType | 'ALL' | 'BRANCH' | 'DRIVER';
        driverId?: string;
        branchId?: string;
    }): Promise<CashTimelineResponseDto>;
    getDiscrepancies(): Promise<{
        generatedAt: string;
        discrepancies: CashResponsibilityDto[];
    }>;
    private buildBreakdown;
    private buildFlows;
    private overallDepositStatus;
    private buildAccountability;
    private buildAlerts;
}
export {};
