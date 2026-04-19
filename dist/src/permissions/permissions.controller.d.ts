import { PermissionKeyDto } from './dto/permission-key.dto';
import { PermissionsService } from './permissions.service';
export declare class PermissionsController {
    private readonly permissionsService;
    constructor(permissionsService: PermissionsService);
    list(): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        key: string;
    }[]>;
    getRole(roleId: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        permissions: {
            id: string;
            key: string;
        }[];
    }>;
    grant(roleId: string, dto: PermissionKeyDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        permissions: {
            id: string;
            key: string;
        }[];
    }>;
    revoke(roleId: string, dto: PermissionKeyDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        permissions: {
            id: string;
            key: string;
        }[];
    }>;
}
