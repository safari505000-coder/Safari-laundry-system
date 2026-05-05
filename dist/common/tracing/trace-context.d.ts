import type { Request } from "express";
export declare function currentTraceId(): string | undefined;
export declare function requestTraceId(req: Request & {
    requestId?: string;
}): string;
export declare function runWithJobTraceAsync<T>(traceIdHex: string | undefined, spanName: string, fn: () => Promise<T>): Promise<T>;
