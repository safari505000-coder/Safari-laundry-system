import { SafariRole } from "@prisma/client";
export declare class LoginUserDto {
    id: string;
    username: string;
    fullName: string;
    phone: string | null;
    safariRole: SafariRole;
    branchId?: string | null;
    linkedCustomerId?: string | null;
}
export declare class LoginResponseDto {
    requiresPasswordChange?: boolean;
    tempToken?: string;
    accessToken?: string;
    refreshToken?: string;
    user: LoginUserDto;
}
