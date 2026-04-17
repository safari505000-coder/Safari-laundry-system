import { DepositStatus } from '@prisma/client';
export declare class UpdateDepositStatusDto {
    status: DepositStatus;
    auditComment?: string;
}
