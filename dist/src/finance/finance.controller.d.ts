import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import { DailyPosSalesQueryDto } from './dto/daily-pos-sales-query.dto';
import { DriverBalanceResponseDto, HandoverResultDto } from './dto/driver-balance.dto';
import { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import { FinanceService } from './finance.service';
export declare class FinanceController {
    private readonly financeService;
    constructor(financeService: FinanceService);
    getOwnerCustomerWalletSummary(): Promise<OwnerCustomerWalletSummaryDto>;
    getDailyPosSales(q: DailyPosSalesQueryDto): Promise<{
        from: string;
        to: string;
        rows: {
            posPaymentMethod: import("@prisma/client").PosPaymentMethod;
            orderCount: number;
            totalRevenue: string;
        }[];
    }>;
    getDriverBalance(): Promise<DriverBalanceResponseDto>;
    confirmHandover(dto: ConfirmHandoverDto, user: JwtUser): Promise<HandoverResultDto>;
}
