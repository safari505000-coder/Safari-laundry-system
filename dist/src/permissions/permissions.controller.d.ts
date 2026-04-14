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
        createdAt: Date;
        updatedAt: Date;
        name: string;
        permissions: {
            id: string;
            key: string;
        }[];
    }>;
    grant(roleId: string, dto: PermissionKeyDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        permissions: {
            id: string;
            key: string;
        }[];
    }>;
    revoke(roleId: string, dto: PermissionKeyDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        permissions: {
            id: string;
            key: string;
        }[];
    }>;
}
