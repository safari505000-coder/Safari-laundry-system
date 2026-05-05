import { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SafariRole } from "@prisma/client";
export declare const CASH_WRITE_ENDPOINT_KEY = "cash-write-endpoint:roles";
export declare function CashWriteEndpoint(...allowedRoles: SafariRole[]): import("@nestjs/common").CustomDecorator<string>;
export declare class CashWritePoliceGuard implements CanActivate {
    private readonly reflector;
    private readonly logger;
    constructor(reflector: Reflector);
    canActivate(context: ExecutionContext): boolean;
}
