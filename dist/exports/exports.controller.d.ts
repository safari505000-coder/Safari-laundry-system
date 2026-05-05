import { StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { ListAttendanceQueryDto } from '../attendance/dto/list-attendance-query.dto';
import { InventoryReportQueryDto } from '../inventory/dto/inventory-report-query.dto';
import { ListMovementsQueryDto } from '../inventory/dto/list-movements-query.dto';
import { ExportsService } from './exports.service';
export declare class ExportsController {
    private readonly exports;
    constructor(exports: ExportsService);
    issuedInvoicesXlsx(from: string, to: string, driverId: string | undefined, branchId: string | undefined, res: Response): Promise<StreamableFile>;
    issuedInvoicesPdf(from: string, to: string, driverId: string | undefined, branchId: string | undefined, res: Response): Promise<StreamableFile>;
    unifiedLedgerXlsx(from: string, to: string, driverId: string | undefined, branchId: string | undefined, res: Response): Promise<StreamableFile>;
    attendanceXlsx(q: ListAttendanceQueryDto, res: Response): Promise<StreamableFile>;
    payrollXlsx(from: string, to: string, branchId: string | undefined, user: JwtUser, res: Response): Promise<StreamableFile>;
    inventoryReportXlsx(q: InventoryReportQueryDto, res: Response): Promise<StreamableFile>;
    stockMovementsXlsx(q: ListMovementsQueryDto, res: Response): Promise<StreamableFile>;
    financialCycleXlsx(date: string | undefined, res: Response): Promise<StreamableFile>;
}
