import { ConsoleLogger } from "@nestjs/common";
export declare class JsonConsoleLogger extends ConsoleLogger {
    private ctxFields;
    private jsonPayload;
    private line;
    log(message: unknown, context?: string): void;
    error(message: unknown, stack?: string, context?: string): void;
    warn(message: unknown, context?: string): void;
    debug(message: unknown, context?: string): void;
    verbose(message: unknown, context?: string): void;
}
