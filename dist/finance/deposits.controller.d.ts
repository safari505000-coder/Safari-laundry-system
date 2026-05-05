import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { DepositsListQueryDto } from './dto/deposits-list-query.dto';
import { UpdateDepositStatusDto } from './dto/update-deposit-status.dto';
import { DepositsService } from './deposits.service';
export declare class DepositsController {
    private readonly depositsService;
    constructor(depositsService: DepositsService);
    list(user: JwtUser, q: DepositsListQueryDto): Promise<{
        rows: {
            id: string;
            driverId: string;
            driverName: string;
            amount: string;
            type: import(".prisma/client").$Enums.DepositType;
            receiptImage: string;
            status: import(".prisma/client").$Enums.DepositStatus;
            auditComment: string | null;
            auditedBy: {
                id: string;
                username: string;
                fullName: string;
            } | null;
            createdAt: string;
            updatedAt: string;
        }[];
    }>;
    create(user: JwtUser, file: Express.Multer.File, amountRaw: string, typeRaw: string): Promise<{
        id: string;
        driverId: string;
        driverName: string;
        amount: string;
        type: import(".prisma/client").$Enums.DepositType;
        receiptImage: string;
        status: import(".prisma/client").$Enums.DepositStatus;
        auditComment: string | null;
        auditedBy: null;
        createdAt: string;
        updatedAt: string;
    }>;
    updateStatus(user: JwtUser, id: string, dto: UpdateDepositStatusDto): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.DepositStatus;
        auditComment: string | null;
        updatedAt: string;
    }>;
}
