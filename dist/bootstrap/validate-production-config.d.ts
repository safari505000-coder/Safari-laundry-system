import type { PrismaService } from '../prisma/prisma.service';
export declare function validateProductionConfig(): void;
export declare function validateProductionConnectivity(prisma: PrismaService): Promise<void>;
