export declare function defaultFromIso(): string;
export declare function defaultToIso(): string;
export declare function assertWithinMaxRange(fromIso: string, toIso: string): void;
export declare class LedgerRangeQueryDto {
    from?: string;
    to?: string;
}
export declare class LedgerTransactionsQueryDto extends LedgerRangeQueryDto {
    accountPrefix?: string;
    take?: number;
}
