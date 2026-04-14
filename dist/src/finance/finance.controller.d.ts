import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import { DriverBalanceResponseDto, HandoverResultDto } from './dto/driver-balance.dto';
import { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import { FinanceService } from './finance.service';
export declare class FinanceController {
    private readonly financeService;
    constructor(financeService: FinanceService);
    getOwnerCustomerWalletSummary(): Promise<OwnerCustomerWalletSummaryDto>;
    getDriverBalance(): Promise<DriverBalanceResponseDto>;
    confirmHandover(dto: ConfirmHandoverDto, user: JwtUser): Promise<HandoverResultDto>;
}
