import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { ManagerDocumentsService } from './manager-documents.service';
export declare class ManagerDocumentsController {
    private readonly svc;
    constructor(svc: ManagerDocumentsService);
    list(user: JwtUser): Promise<import("./manager-documents.service").ManagerDocumentRow[]>;
    getExpenseVoucher(id: string, user: JwtUser): Promise<{
        id: string;
        title: string;
        amountKd: string;
        category: import(".prisma/client").$Enums.ExpenseCategory;
        expenseMethod: import(".prisma/client").$Enums.ExpenseMethod;
        note: string | null;
        expenseDate: string;
        approvedAt: string;
        status: import(".prisma/client").$Enums.ExpenseStatus;
        recordedBy: {
            id: string;
            fullName: string;
            username: string;
        };
        branch: {
            id: string;
            name: string;
        } | null;
    }>;
}
