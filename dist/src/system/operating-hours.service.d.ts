export declare class OperatingHoursService {
    isLockEnabled(): boolean;
    getKuwaitClockMinutes(): number;
    isWithinOperatingWindow(): boolean;
    getStatusPayload(): {
        isOpen: boolean;
        kuwaitTimeLabel: string;
        financialDateIso: string;
        financialDateLabel: string;
        reportingDayStartHour: number;
        fullScreenClosedRoles: readonly ["DRIVER"];
    };
}
