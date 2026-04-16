import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import { DebtByCategoryQueryDto } from './dto/debt-by-category-query.dto';
import { DailyPosSalesQueryDto } from './dto/daily-pos-sales-query.dto';
import { DriverBalanceResponseDto, HandoverResultDto } from './dto/driver-balance.dto';
import { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
import { UpdateDriverTrackingDto } from './dto/update-driver-tracking.dto';
import { FinanceService } from './finance.service';
export declare class FinanceController {
    private readonly financeService;
    constructor(financeService: FinanceService);
    driverEnsureShift(user: JwtUser): Promise<{
        ok: boolean;
    }>;
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
    getDebtByCategory(q: DebtByCategoryQueryDto): Promise<{
        from: string;
        to: string;
        rows: {
            category: import("@prisma/client").$Enums.DebtEntityCategory;
            source: import("@prisma/client").$Enums.DebtSource;
            entryCount: number;
            totalDebt: string;
        }[];
    }>;
    uploadHandoverReceipt(file: Express.Multer.File): {
        depositReceiptUrl: string;
    };
    getDriverBalance(): Promise<DriverBalanceResponseDto>;
    getDriverMonitoring(): Promise<{
        drivers: {
            driverId: string;
            fullName: string;
            username: string;
            phone: string | null;
            vehicleLabel: string;
            status: "ON_SHIFT";
            source: "LIVE_GPS" | "BRANCH_FALLBACK";
            lastKnownLocation: {
                lat: number;
                lng: number;
            } | null;
            markerLocation: {
                lat: number;
                lng: number;
            } | null;
            branch: {
                id: string;
                name: string;
                location: string;
            } | null;
        }[];
    }>;
    updateDriverTracking(driverId: string, dto: UpdateDriverTrackingDto): Promise<{
        id: string;
        username: string;
        fullName: string;
        vehicleLabel: string | null;
        lastKnownLocation: string | null;
    }>;
    confirmHandover(dto: ConfirmHandoverDto, user: JwtUser): Promise<HandoverResultDto>;
    getFinancialCycleReport(): Promise<{
        rows: {
            orderId: string;
            amountKd: string;
            collectedAt: string | null;
            collectedByManager: {
                id: string;
                username: string;
                fullName: string;
            } | null;
            depositLogId: string | null;
            receiptImageUrl: string | null;
            verifiedAt: string | null;
            verifiedByAccountant: {
                id: string;
                username: string;
                fullName: string;
            } | null;
            lastUpdatedAt: string;
        }[];
    }>;
}
