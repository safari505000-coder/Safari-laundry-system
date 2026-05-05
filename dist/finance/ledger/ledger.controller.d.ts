import { type JwtUser } from '../../auth/decorators/current-user.decorator';
import { LedgerRangeQueryDto, LedgerTransactionsQueryDto } from './dto/ledger-query.dto';
import { LedgerAccountResponseDto, LedgerReconciliationResponseDto, LedgerSummaryResponseDto, LedgerTransactionsResponseDto } from './dto/ledger-response.dto';
import { LedgerProjectionService } from './ledger-projection.service';
export declare class LedgerController {
    private readonly projection;
    constructor(projection: LedgerProjectionService);
    getSummary(user: JwtUser, q: LedgerRangeQueryDto): Promise<LedgerSummaryResponseDto>;
    getDriverAccount(user: JwtUser, driverId: string, q: LedgerRangeQueryDto): Promise<LedgerAccountResponseDto>;
    getManagerAccount(user: JwtUser, managerId: string, q: LedgerRangeQueryDto): Promise<LedgerAccountResponseDto>;
    getTransactions(user: JwtUser, q: LedgerTransactionsQueryDto): Promise<LedgerTransactionsResponseDto>;
    getReconciliation(user: JwtUser, q: LedgerRangeQueryDto): Promise<LedgerReconciliationResponseDto>;
    private accountView;
}
