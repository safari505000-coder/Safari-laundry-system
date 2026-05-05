import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { BankDepositsService } from './bank-deposits.service';
import { BankDepositsListQueryDto } from './dto/bank-deposits-list-query.dto';
export declare class BankDepositsController {
    private readonly bankDepositsService;
    constructor(bankDepositsService: BankDepositsService);
    list(q: BankDepositsListQueryDto): Promise<{
        from: string;
        to: string;
        entries: {
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
        }[];
    }>;
    create(file: Express.Multer.File, depositTypeRaw: string, amountRaw: string, shiftId: string | undefined, user: JwtUser): Promise<{
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
    verify(id: string, user: JwtUser): Promise<{
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
