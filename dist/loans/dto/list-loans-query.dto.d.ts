import { LoanStatus } from '@prisma/client';
export declare class ListLoansQueryDto {
    status?: LoanStatus;
    userId?: string;
}
