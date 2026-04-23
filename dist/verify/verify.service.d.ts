import { PrismaService } from '../prisma/prisma.service';
export type VerifyResult = {
    docType: 'payslip' | 'attendance_report' | 'leave_request' | 'employee_loan' | 'statement' | 'debt_hold' | 'cash_receipt' | 'payroll_roster';
    docId: string;
    valid: boolean;
    issuedAtIso: string;
    issuedTo: {
        fullName: string;
        username: string;
        employeeId: string | null;
    };
    summary: Record<string, string | number | null>;
};
export declare class VerifyService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    verifyPayslip(id: string): Promise<VerifyResult>;
    verifyLeave(id: string): Promise<VerifyResult>;
    verifyStatement(id: string): Promise<VerifyResult>;
    verifyDebtHold(id: string): Promise<VerifyResult>;
    verifyCashReceipt(id: string): Promise<VerifyResult>;
    verifyPayrollRoster(token: string): Promise<VerifyResult>;
    verifyLoan(id: string): Promise<VerifyResult>;
}
