import { PrismaService } from '../../prisma/prisma.service';
import type { OwnerFinancialDashboardDto } from '../dto/owner-financial-dashboard.dto';
import { AccountantDashboardService } from './accountant-dashboard.service';
import { CashService } from './cash.service';
import { CustomerIntelligenceService } from './customer-intelligence.service';
import { DriverRiskService } from './driver-risk.service';
import { FinanceDashboardCacheService } from './finance-dashboard-cache.service';
import { FinancialAlertsService } from './financial-alerts.service';
export declare class OwnerFinancialDashboardService {
    private readonly prisma;
    private readonly cashService;
    private readonly accountantDashboard;
    private readonly customerIntelligence;
    private readonly driverRisk;
    private readonly alerts;
    private readonly cache;
    constructor(prisma: PrismaService, cashService: CashService, accountantDashboard: AccountantDashboardService, customerIntelligence: CustomerIntelligenceService, driverRisk: DriverRiskService, alerts: FinancialAlertsService, cache: FinanceDashboardCacheService);
    getDashboard(): Promise<OwnerFinancialDashboardDto>;
    private buildDashboard;
    private totalInvoices;
    private totalPayments;
    private cashInOffice;
    private customerRollup;
}
