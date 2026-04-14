import { PosPaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';
import type { DriverBalanceResponseDto, HandoverResultDto } from './dto/driver-balance.dto';
import type { OwnerCustomerWalletSummaryDto } from './dto/owner-customer-wallet-summary.dto';
export declare class FinanceService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    ensureOpenShiftForDriver(driverId: string): Promise<void>;
    getDailyPosSalesByPaymentMethod(fromIso: string, toIso: string): Promise<{
        from: string;
        to: string;
        rows: {
            posPaymentMethod: PosPaymentMethod;
            orderCount: number;
            totalRevenue: string;
        }[];
    }>;
    getOwnerCustomerWalletSummary(): Promise<OwnerCustomerWalletSummaryDto>;
    getDriverBalances(): Promise<DriverBalanceResponseDto>;
    confirmHandover(managerId: string, dto: ConfirmHandoverDto): Promise<HandoverResultDto>;
}
