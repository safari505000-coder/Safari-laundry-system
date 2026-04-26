export declare class CreatePayrollAdhocLineDto {
    branchId: string;
    periodYm: string;
    beneficiaryName: string;
    bankName?: string | null;
    bankIban?: string | null;
    basicSalary: number;
    allowances?: number;
    deductions?: number;
    lineSort?: number;
    note?: string | null;
}
