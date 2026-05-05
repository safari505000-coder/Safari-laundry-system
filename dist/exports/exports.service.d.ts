import { PassThrough } from 'node:stream';
import { SafariRole } from "@prisma/client";
import { AttendanceService } from '../attendance/attendance.service';
import type { ListAttendanceQueryDto } from '../attendance/dto/list-attendance-query.dto';
import { FinanceService } from '../finance/finance.service';
import type { InventoryReportQueryDto } from '../inventory/dto/inventory-report-query.dto';
import { InventoryService } from '../inventory/inventory.service';
import type { ListMovementsQueryDto } from '../inventory/dto/list-movements-query.dto';
import { PayrollService } from '../payroll/payroll.service';
import { ReportsService } from '../reports/reports.service';
export declare class ExportsService {
    private readonly reports;
    private readonly attendance;
    private readonly payroll;
    private readonly finance;
    private readonly inventory;
    constructor(reports: ReportsService, attendance: AttendanceService, payroll: PayrollService, finance: FinanceService, inventory: InventoryService);
    issuedInvoicesXlsx(fromIso: string, toIso: string, driverId?: string, branchId?: string): Promise<{
        stream: PassThrough;
        filename: string;
    }>;
    unifiedLedgerXlsx(fromIso: string, toIso: string, driverId?: string, branchId?: string): Promise<{
        stream: PassThrough;
        filename: string;
    }>;
    attendanceXlsx(q: ListAttendanceQueryDto): Promise<{
        stream: PassThrough;
        filename: string;
    }>;
    payrollXlsx(actorRole: SafariRole, fromIso: string, toIso: string, branchId?: string): Promise<{
        stream: PassThrough;
        filename: string;
    }>;
    inventoryReportXlsx(filters: InventoryReportQueryDto): Promise<{
        stream: PassThrough;
        filename: string;
    }>;
    stockMovementsXlsx(q: ListMovementsQueryDto): Promise<{
        stream: PassThrough;
        filename: string;
    }>;
    financialCycleXlsx(_dateIso?: string): Promise<{
        stream: PassThrough;
        filename: string;
    }>;
    issuedInvoicesPdf(fromIso: string, toIso: string, driverId?: string, branchId?: string): Promise<{
        stream: PassThrough;
        filename: string;
    }>;
    private buildWorkbook;
    private styleHeader;
    private bookToStream;
    private buildTablePdf;
}
