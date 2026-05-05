import { CanActivate, ExecutionContext } from "@nestjs/common";
import { CustomerBlockingService } from '../services/customer-blocking.service';
export declare class CustomerBlockGuard implements CanActivate {
    private readonly blocking;
    constructor(blocking: CustomerBlockingService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
