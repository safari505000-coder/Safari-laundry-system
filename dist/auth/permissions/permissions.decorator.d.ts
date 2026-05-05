import { AppPermission } from './permissions.enum';
export declare const PERMISSIONS_KEY = "safariPermissions";
export declare const Permissions: (...permissions: AppPermission[]) => import("@nestjs/common").CustomDecorator<string>;
