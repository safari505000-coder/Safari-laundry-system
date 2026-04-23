export declare class CreatePayrollDto {
    userId: string;
    branchId: string;
    basicSalary: number;
    allowances?: number;
    deductions?: number;
    paymentDate: string;
}
