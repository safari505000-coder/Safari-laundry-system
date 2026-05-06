import type { JwtUser } from '../../auth/decorators/current-user.decorator';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OutstandingQueryDto } from './dto/outstanding-query.dto';
import { OutstandingResponseDto } from './dto/outstanding-row.dto';
import { CustomerCollectionStatusDto, UpdateCustomerCollectionStatusDto } from './dto/update-customer-collection-status.dto';
export declare class OutstandingService {
    private readonly prisma;
    private readonly auditLogs;
    private readonly orders;
    constructor(prisma: PrismaService, auditLogs: AuditLogsService, orders: OrdersService);
    listOutstanding(query: OutstandingQueryDto, actor?: JwtUser | null): Promise<OutstandingResponseDto>;
    private traceDebtTotals;
    private assertCanonicalTotal;
    updateCollectionStatus(input: {
        customerId: string;
        body: UpdateCustomerCollectionStatusDto;
        actorUserId: string | null;
        actorRole: string | null;
    }): Promise<CustomerCollectionStatusDto>;
    getCollectionStatus(customerId: string): Promise<CustomerCollectionStatusDto>;
    assertNotBlocked(customerId: string): Promise<void>;
    private resolveReportingBounds;
    private emptyResponse;
    private groupByCustomer;
    private applyPostFilters;
    private toStatusDto;
}
