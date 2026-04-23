import { ManagerCashCustodyStatus, SafariRole } from '@prisma/client';
import { CashService } from '../finance/services/cash.service';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveReceiptFromDriverDto } from './dto/approve-receipt-from-driver.dto';
import { ListCustodyQueryDto } from './dto/list-custody-query.dto';
import { RejectCustodyDto } from './dto/reject-custody.dto';
import { UploadDepositSlipDto } from './dto/upload-deposit-slip.dto';
import { VerifyCustodyDto } from './dto/verify-custody.dto';
export declare const CUSTODY_OVERDUE_MS: number;
export type CustodyRowDto = {
    id: string;
    managerId: string;
    managerName: string;
    managerUsername: string;
    managerPhone: string | null;
    driverId: string;
    driverName: string;
    driverUsername: string;
    branchId: string | null;
    branchName: string | null;
    shiftId: string | null;
    amountKd: string;
    settledOrderCount: number;
    status: ManagerCashCustodyStatus;
    receivedFromDriverAt: string;
    slipUploadedAt: string | null;
    depositSlipUrl: string | null;
    verifiedAt: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
    ageHours: number;
    isOverdue: boolean;
};
export type AgingBucket = 'FRESH' | 'WARNING_12H' | 'OVERDUE_24H';
export type AgingSummary = {
    pendingCount: number;
    awaitingVerificationCount: number;
    overdueCount: number;
    totalPendingKd: string;
    totalOverdueKd: string;
    bucket: Record<AgingBucket, number>;
};
export declare class ManagerCustodyService {
    private readonly prisma;
    private readonly generalLedger;
    private readonly cashService;
    private readonly logger;
    constructor(prisma: PrismaService, generalLedger: GeneralLedgerService, cashService: CashService);
    approveReceiptFromDriver(managerId: string, _managerBranchId: string | null, dto: ApproveReceiptFromDriverDto): Promise<CustodyRowDto>;
    uploadDepositSlip(custodyId: string, managerId: string, dto: UploadDepositSlipDto): Promise<CustodyRowDto>;
    verifyCustody(custodyId: string, accountantId: string, dto: VerifyCustodyDto): Promise<CustodyRowDto>;
    rejectCustody(custodyId: string, accountantId: string, dto: RejectCustodyDto): Promise<CustodyRowDto>;
    listMine(managerId: string): Promise<CustodyRowDto[]>;
    listByDriver(driverId: string): Promise<CustodyRowDto[]>;
    findByIdForReceipt(custodyId: string, actorUserId: string, actorRole: SafariRole): Promise<CustodyRowDto>;
    listAging(query: ListCustodyQueryDto): Promise<{
        rows: CustodyRowDto[];
        summary: AgingSummary;
    }>;
    getStreamMetrics(): Promise<{
        fleetOverdueCount: number;
        fleetOverdueAmountKd: string;
        fleetPendingAmountKd: string;
        pendingByManager: Array<{
            managerId: string;
            count: number;
            amountKd: string;
        }>;
    }>;
    private requireBag;
    private toRow;
    private summarise;
}
