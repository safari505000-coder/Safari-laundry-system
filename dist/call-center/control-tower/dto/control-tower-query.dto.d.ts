export declare enum ControlTowerPreset {
    ALL = "all",
    TODAY = "today",
    WEEK = "week",
    MONTH = "month"
}
export declare class ControlTowerQueryDto {
    preset?: ControlTowerPreset;
    driverId?: string;
    topLimit?: number;
}
