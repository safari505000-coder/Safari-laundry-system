import { Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLoanDto } from './dto/create-loan.dto';
import type { ListLoansQueryDto } from './dto/list-loans-query.dto';
declare const LOAN_INCLUDE: {
    user: {
        select: {
            id: true;
            fullName: true;
            username: true;
            employeeId: true;
            civilId: true;
            jobTitle: true;
            branch: {
                select: {
                    id: true;
                    name: true;
                };
            };
        };
    };
    approvedBy: {
        select: {
            id: true;
            fullName: true;
            username: true;
        };
    };
};
export type LoanRow = Prisma.EmployeeLoanGetPayload<{
    include: typeof LOAN_INCLUDE;
}>;
export declare class LoansService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(actorRole: SafariRole, actorUserId: string, dto: CreateLoanDto): Promise<LoanRow>;
    list(actorRole: SafariRole, actorUserId: string, q: ListLoansQueryDto): Promise<LoanRow[]>;
    listMine(actorUserId: string): Promise<LoanRow[]>;
    findOne(actorRole: SafariRole, actorUserId: string, id: string): Promise<LoanRow>;
    approve(actorRole: SafariRole, actorUserId: string, id: string): Promise<LoanRow>;
    reject(actorRole: SafariRole, actorUserId: string, id: string, reason: string): Promise<LoanRow>;
    deductManual(actorRole: SafariRole, loanId: string, amountKd: number, note?: string): Promise<LoanRow>;
    bookPayrollInstalmentsFor(userId: string, yearMonth: string, tx: Prisma.TransactionClient): Promise<Prisma.Decimal>;
    recalcUnbookedInstalmentsFor(userId: string, yearMonth: string, tx: Prisma.TransactionClient): Promise<Prisma.Decimal>;
}
export {};
