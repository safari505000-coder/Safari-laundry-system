export declare class DriverCashTraceQueryDto {
    from: string;
    to: string;
    driverId?: string;
    branchId?: string;
}
export declare class DriverCashTraceBagDto {
    id: string;
    amountKd: string;
    settledOrderCount: number;
    status: 'PENDING_DEPOSIT' | 'AWAITING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
    managerId: string | null;
    managerName: string | null;
    managerUsername: string | null;
    branchId: string | null;
    branchName: string | null;
    receivedFromDriverAt: string;
    slipUploadedAt: string | null;
    verifiedAt: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
}
export declare class DriverCashTraceDriverDto {
    driverId: string;
    username: string;
    fullName: string;
    branchId: string | null;
    branchName: string | null;
    collectedKd: string;
    collectedOrderCount: number;
    handedToManagerKd: string;
    handedToManagerBagCount: number;
    pendingWithDriverKd: string;
    atBankKd: string;
    pendingAtManagerKd: string;
    awaitingVerificationKd: string;
    rejectedKd: string;
    bags: DriverCashTraceBagDto[];
}
export declare class DriverCashTraceKpisDto {
    totalCollectedKd: string;
    totalHandedToManagerKd: string;
    totalAtBankKd: string;
    totalPendingWithDriverKd: string;
    totalPendingAtManagerKd: string;
    totalAwaitingVerificationKd: string;
    totalRejectedKd: string;
    totalCollectedOrderCount: number;
    totalBagCount: number;
}
export declare class DriverCashTraceRangeDto {
    from: string;
    to: string;
}
export declare class DriverCashTraceResponseDto {
    range: DriverCashTraceRangeDto;
    kpis: DriverCashTraceKpisDto;
    drivers: DriverCashTraceDriverDto[];
}
