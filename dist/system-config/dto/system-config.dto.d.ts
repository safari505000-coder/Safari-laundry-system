export declare class UpdateSystemConfigDto {
    guardianPhone?: string | null;
}
export declare class GuardianPhoneResolvedDto {
    phone: string | null;
    source: 'database' | 'env' | 'none';
}
export declare class SystemConfigResponseDto {
    guardianPhone: string | null;
    resolved: GuardianPhoneResolvedDto;
    updatedAt: string | null;
}
