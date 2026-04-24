import { SafariRole } from '@prisma/client';
export declare class SetDriverPrefixDto {
    driverPrefix?: string | null;
}
export declare class DriverPrefixRowDto {
    id: string;
    fullName: string;
    username: string;
    driverPrefix: string | null;
    branchName: string | null;
    isActive: boolean;
    safariRole: Extract<SafariRole, 'DRIVER' | 'MANAGER'>;
}
export declare class SerialLogRowDto {
    orderId: string;
    serialNumber: string;
    driverId: string | null;
    driverName: string | null;
    driverPrefix: string | null;
    customerName: string | null;
    totalPriceKd: string;
    createdAtIso: string;
}
export declare class SerialLogDto {
    currentCounter: number;
    rows: SerialLogRowDto[];
}
