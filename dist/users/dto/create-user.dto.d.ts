import { SafariRole } from '@prisma/client';
export declare class CreateUserDto {
    fullName: string;
    username: string;
    password: string;
    safariRole: SafariRole;
    phone?: string;
    jobTitle?: string;
    branchId: string;
    isActive?: boolean;
    payrollRosterLineOrder?: number | null;
}
