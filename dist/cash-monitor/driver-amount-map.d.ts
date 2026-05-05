export interface ClassifiedLikeDriver {
    driverId: string;
    amount: string;
}
export interface ClassifiedLike {
    drivers: ReadonlyArray<ClassifiedLikeDriver>;
}
export type DriverAmountMap = ReadonlyMap<string, string>;
export declare function buildDriverAmountMap(classified: ClassifiedLike): DriverAmountMap;
export declare function getDriverAmountStr(map: DriverAmountMap, driverId: string): string;
export declare function getDriverAmountKd(map: DriverAmountMap, driverId: string): number;
export declare function sumClassifiedKd(classified: ClassifiedLike): number;
export declare function sumClassifiedKdLabel(classified: ClassifiedLike): string;
export declare function getDriverAmountFromSSoT(map: DriverAmountMap, driverId: string): string;
