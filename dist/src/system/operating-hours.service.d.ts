export declare class OperatingHoursService {
    isLockEnabled(): boolean;
    getKuwaitClockMinutes(): number;
    getWindowHours(): {
        startHour: number;
        endHour: number;
    };
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
