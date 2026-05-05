import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { BankDepositsService } from '../finance/bank-deposits.service';
import { ApproveReceiptFromDriverDto } from './dto/approve-receipt-from-driver.dto';
import { RejectCustodyDto } from './dto/reject-custody.dto';
import { VerifyCustodyDto } from './dto/verify-custody.dto';
import { ManagerCustodyService } from './manager-custody.service';
declare class VerifyDepositAliasDto extends VerifyCustodyDto {
    custodyId: string;
}
declare class RejectCustodyAliasDto extends RejectCustodyDto {
    custodyId: string;
}
export declare class CashFlowAliasesController {
    private readonly managerCustody;
    private readonly bankDeposits;
    constructor(managerCustody: ManagerCustodyService, bankDeposits: BankDepositsService);
    getCashStatus(user: JwtUser): Promise<import("./manager-custody.service").ManagerCashStatusSnapshotDto>;
    handoverCash(dto: ApproveReceiptFromDriverDto, user: JwtUser): Promise<import("./manager-custody.service").CustodyRowDto>;
    verifyDeposit(dto: VerifyDepositAliasDto, user: JwtUser): Promise<import("./manager-custody.service").CustodyRowDto>;
    rejectCustody(dto: RejectCustodyAliasDto, user: JwtUser): Promise<import("./manager-custody.service").CustodyRowDto>;
    uploadSlip(file: Express.Multer.File, depositTypeRaw: string, amountRaw: string, shiftId: string | undefined, user: JwtUser): Promise<{
        id: string;
        depositType: import(".prisma/client").$Enums.BankDepositType;
        status: import(".prisma/client").$Enums.BankDepositStatus;
        amountKd: string;
        receiptImageUrl: string;
        shiftId: string | null;
        createdAt: string;
        verifiedAt: string | null;
        uploadedBy: {
            id: string;
            username: string;
            fullName: string;
        };
        verifiedByAccountant: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    }>;
}
export {};
