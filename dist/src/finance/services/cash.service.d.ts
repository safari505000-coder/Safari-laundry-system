import { PrismaService } from '../../prisma/prisma.service';
import { ConfirmHandoverDto } from '../dto/confirm-handover.dto';
import type { DriverBalanceResponseDto, HandoverResultDto } from '../dto/driver-balance.dto';
import type { UpdateDriverTrackingDto } from '../dto/update-driver-tracking.dto';
export declare class CashService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    ensureOpenShiftForDriver(driverId: string): Promise<void>;
    getDailyPosSalesByPaymentMethod(fromIso: string, toIso: string): Promise<{
        from: string;
        to: string;
        rows: {
            posPaymentMethod: "SUBSCRIPTION_WALLET" | "CASH" | "KNET" | "PAYMENT_LINK" | "DEBT_ON_ACCOUNT" | "ONLINE";
            orderCount: number;
            totalRevenue: string;
        }[];
    }>;
    getDriverBalances(): Promise<DriverBalanceResponseDto>;
    getTotalCashWithDrivers(): Promise<string>;
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
    confirmHandover(managerId: string, dto: ConfirmHandoverDto): Promise<HandoverResultDto>;
    getOwnerFinancialCycleReport(): Promise<{
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
