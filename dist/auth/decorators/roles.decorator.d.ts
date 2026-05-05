import { SafariRole } from "@prisma/client";
export declare const ROLES_KEY = "safariRoles";
export declare const IS_PUBLIC_KEY = "isPublicEndpoint";
export declare const Roles: (...roles: SafariRole[]) => import("@nestjs/common").CustomDecorator<string>;
export declare const Public: (reason: string) => import("@nestjs/common").CustomDecorator<string>;
export declare const DRIVER_FINANCE_DAILY_POS_KEY = "driverFinanceDailyPosSales";
export declare const AllowDriverDailyPosSales: () => import("@nestjs/common").CustomDecorator<string>;
