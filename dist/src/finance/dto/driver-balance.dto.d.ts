export declare class DriverBalanceRowDto {
    driverId: string;
    employeeId: string | null;
    username: string;
    fullName: string;
    phone: string | null;
    branchId: string | null;
    currentShiftId: string | null;
    shiftStartedAt: Date | null;
    heldCashTotal: string;
    pendingSettlementOrderCount: number;
}
export declare class DriverBalanceResponseDto {
    drivers: DriverBalanceRowDto[];
}
export declare class HandoverResultDto {
    settledOrderCount: number;
    systemHandoverTotal: string;
    shiftId: string;
}
