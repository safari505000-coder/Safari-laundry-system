import { PrismaService } from '../prisma/prisma.service';
export declare class PaymentMethodFeesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    ensureDefaultRow(): Promise<void>;
    getConfig(): Promise<{
        id: string;
        updatedAt: Date;
        knetFlatKd: import("@prisma/client-runtime-utils/dist").Decimal;
        knetPercentOfGross: import("@prisma/client-runtime-utils/dist").Decimal;
        knetRule: import(".prisma/client").$Enums.KnetCommissionRule;
        cardPercentOfGross: import("@prisma/client-runtime-utils/dist").Decimal;
    }>;
}
