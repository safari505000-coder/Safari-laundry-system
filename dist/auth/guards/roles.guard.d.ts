import { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsService } from '../../permissions/permissions.service';
export declare class RolesGuard implements CanActivate {
    private readonly reflector;
    private readonly permissionsService;
    constructor(reflector: Reflector, permissionsService: PermissionsService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
