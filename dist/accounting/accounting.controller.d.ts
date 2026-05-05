import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingReconciliationService } from './accounting-reconciliation.service';
import { AccountingReconciliationQueryDto, AccountingTimelineQueryDto } from './dto/accounting-query.dto';
export declare class AccountingController {
    private readonly reconciliation;
    private readonly prisma;
    constructor(reconciliation: AccountingReconciliationService, prisma: PrismaService);
    private clampScopeForManager;
    getReconciliation(query: AccountingReconciliationQueryDto, user: JwtUser): Promise<import("./dto/cash-control.dto").CashReconciliationDto>;
    getTimeline(query: AccountingTimelineQueryDto, user: JwtUser): Promise<import("./dto/cash-control.dto").CashTimelineResponseDto>;
    getDiscrepancies(): Promise<{
        generatedAt: string;
        discrepancies: import("./dto/cash-control.dto").CashResponsibilityDto[];
    }>;
}
