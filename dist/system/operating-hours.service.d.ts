import { OnModuleInit } from "@nestjs/common";
export declare class OperatingHoursService implements OnModuleInit {
    private readonly logger;
    onModuleInit(): void;
    isLockEnabled(): boolean;
    getKuwaitClockMinutes(): number;
    getWindowHours(): {
        startHour: number;
        endHour: number;
    };
    isWithinOperatingWindow(): boolean;
    getStatusPayload(): {
        isOpen: boolean;
        lockEnabled: boolean;
        kuwaitTimeLabel: string;
        financialDateIso: string;
        financialDateLabel: string;
        reportingDayStartHour: number;
        fullScreenClosedRoles: readonly ["DRIVER"];
    };
}
