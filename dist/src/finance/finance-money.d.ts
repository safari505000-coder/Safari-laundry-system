export declare const HANDOVER_TOLERANCE_MINOR = 1n;
export declare function toMinorFromFixed4(totalPrice: {
    toFixed: (n: number) => string;
}): bigint;
export declare function parseFixed4ToMinor(s: string): bigint;
export declare function declaredNumberToMinor(declared: number): bigint;
export declare function sumOrderMinors(rows: {
    totalPrice: {
        toFixed: (n: number) => string;
    };
}[]): bigint;
export declare function minorToAmountString(minor: bigint): string;
export declare function assertDeclaredMatchesLedgerMinor(ledgerMinor: bigint, declared: number): void;
