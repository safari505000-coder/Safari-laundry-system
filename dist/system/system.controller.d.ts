import { OperatingHoursService } from './operating-hours.service';
export declare class SystemController {
    private readonly operatingHours;
    constructor(operatingHours: OperatingHoursService);
    operatingStatus(): {
        isOpen: boolean;
        lockEnabled: boolean;
        kuwaitTimeLabel: string;
        financialDateIso: string;
        financialDateLabel: string;
        reportingDayStartHour: number;
        fullScreenClosedRoles: readonly ["DRIVER"];
    };
}
