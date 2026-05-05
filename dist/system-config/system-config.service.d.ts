import { PrismaService } from '../prisma/prisma.service';
export declare const SYSTEM_CONFIG_ID = "GLOBAL";
export type GuardianPhoneSource = 'database' | 'env' | 'none';
export type ResolvedGuardianPhone = {
    phone: string | null;
    source: GuardianPhoneSource;
};
export declare class SystemConfigService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getGuardianPhone(): Promise<string | null>;
    resolveGuardianPhone(): Promise<ResolvedGuardianPhone>;
    getPublicConfig(): Promise<{
        guardianPhone: string | null;
        resolved: ResolvedGuardianPhone;
        updatedAt: string | null;
    }>;
    setGuardianPhone(input: string | null): Promise<{
        guardianPhone: string | null;
        updatedAt: string;
    }>;
}
