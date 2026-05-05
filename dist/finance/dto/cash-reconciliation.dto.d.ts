import { DriverCashTraceKpisDto, DriverCashTraceQueryDto } from './driver-cash-trace.dto';
export declare class CashReconciliationQueryDto extends DriverCashTraceQueryDto {
}
export type CashReconciliationSnapshotDto = {
    range: {
        from: string;
        to: string;
    };
    notes: string[];
    eventBasedInRange: {
        collectedKd: string;
        handedToManagerKd: string;
        collectedOrderCount: number;
        handedBagCount: number;
    };
    stateBasedNow: {
        pendingWithDriversKd: string;
        pendingWithManagersDepositOrRejectedKd: string;
        pendingWithManagersDepositOrRejectedBagCount: number;
        awaitingVerificationKd: string;
        awaitingVerificationBagCount: number;
    };
    driverCashTraceKpis: DriverCashTraceKpisDto;
};
