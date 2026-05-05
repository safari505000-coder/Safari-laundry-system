import type { FinancialAlertDto, OwnerTopCustomerDto, RiskyDriverDto } from '../dto/owner-financial-dashboard.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { DriverRiskService } from './driver-risk.service';
export declare class FinancialAlertsService {
    private readonly driverRisk;
    constructor(driverRisk: DriverRiskService);
    buildAlerts(input: {
        topCustomers: OwnerTopCustomerDto[];
        riskyDrivers?: RiskyDriverDto[];
        reconciliationDifferenceKd: string;
        expenseCurrentKd: string;
        expensePreviousKd: string;
        now?: Date;
    }): Promise<FinancialAlertDto[]>;
    expenseWindowTotals(prisma: PrismaService, current: {
        from: Date;
        to: Date;
    }, previous: {
        from: Date;
        to: Date;
    }): Promise<{
        currentKd: string;
        previousKd: string;
    }>;
}
