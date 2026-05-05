import { CashClassifierService } from './cash-classifier.service';
import { CashExecutiveService } from './cash-executive.service';
import { CashClassifiedResponseDto } from './dto/cash-classified.dto';
import { CashExecutiveResponseDto } from './dto/cash-executive.dto';
import { CashDashboardResponseDto } from './dto/cash-dashboard.dto';
import { BranchCashLedgerResponse, BranchCashLedgerService } from './branch-cash-ledger.service';
export declare class CashDashboardService {
    private readonly classifier;
    private readonly executive;
    private readonly branchLedger;
    private readonly logger;
    constructor(classifier: CashClassifierService, executive: CashExecutiveService, branchLedger: BranchCashLedgerService);
    getDashboard(): Promise<CashDashboardResponseDto>;
    compose(classified: CashClassifiedResponseDto, executive: CashExecutiveResponseDto, branchLedger: BranchCashLedgerResponse): CashDashboardResponseDto;
}
