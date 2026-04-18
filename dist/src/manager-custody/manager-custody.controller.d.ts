import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { ApproveReceiptFromDriverDto } from './dto/approve-receipt-from-driver.dto';
import { ListCustodyQueryDto } from './dto/list-custody-query.dto';
import { RejectCustodyDto } from './dto/reject-custody.dto';
import { UploadDepositSlipDto } from './dto/upload-deposit-slip.dto';
import { VerifyCustodyDto } from './dto/verify-custody.dto';
import { ManagerCustodyService } from './manager-custody.service';
export declare class ManagerCustodyController {
    private readonly svc;
    constructor(svc: ManagerCustodyService);
    approveReceipt(dto: ApproveReceiptFromDriverDto, user: JwtUser): Promise<import("./manager-custody.service").CustodyRowDto>;
    uploadSlipImage(file: Express.Multer.File): {
        depositSlipUrl: string;
    };
    uploadSlip(id: string, dto: UploadDepositSlipDto, user: JwtUser): Promise<import("./manager-custody.service").CustodyRowDto>;
    listMine(user: JwtUser): Promise<import("./manager-custody.service").CustodyRowDto[]>;
    verify(id: string, dto: VerifyCustodyDto, user: JwtUser): Promise<import("./manager-custody.service").CustodyRowDto>;
    reject(id: string, dto: RejectCustodyDto, user: JwtUser): Promise<import("./manager-custody.service").CustodyRowDto>;
    aging(q: ListCustodyQueryDto): Promise<{
        rows: import("./manager-custody.service").CustodyRowDto[];
        summary: import("./manager-custody.service").AgingSummary;
    }>;
}
