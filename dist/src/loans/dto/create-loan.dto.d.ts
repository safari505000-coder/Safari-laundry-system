export declare class CreateLoanDto {
    userId?: string;
    amount: number;
    installmentCount: number;
    reason?: string;
}
export declare class RejectLoanDto {
    reason: string;
}
