import { SafariRole } from '@prisma/client';
export declare class LoginUserDto {
    id: string;
    username: string;
    fullName: string;
    phone: string | null;
    safariRole: SafariRole;
    branchId?: string | null;
}
export declare class LoginResponseDto {
    accessToken: string;
    refreshToken: string;
    user: LoginUserDto;
}
