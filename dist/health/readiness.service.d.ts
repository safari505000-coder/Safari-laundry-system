import { PrismaService } from '../prisma/prisma.service';
export declare class ReadinessService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    check(): Promise<{
        ok: boolean;
        checks: Record<string, boolean>;
        region: string;
        deploymentColor: string;
    }>;
}
