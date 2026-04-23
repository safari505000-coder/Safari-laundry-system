import { UpdatePaymentMethodFeesDto } from './dto/update-payment-method-fees.dto';
import { PaymentMethodFeesService } from './payment-method-fees.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class PaymentMethodFeesController {
    private readonly feesService;
    private readonly prisma;
    constructor(feesService: PaymentMethodFeesService, prisma: PrismaService);
    getConfig(): Promise<{
        id: string;
        updatedAt: Date;
        knetFlatKd: import("@prisma/client-runtime-utils").Decimal;
        knetPercentOfGross: import("@prisma/client-runtime-utils").Decimal;
        knetRule: import("@prisma/client").$Enums.KnetCommissionRule;
        cardPercentOfGross: import("@prisma/client-runtime-utils").Decimal;
    }>;
    patch(dto: UpdatePaymentMethodFeesDto): Promise<{
        id: string;
        updatedAt: Date;
        knetFlatKd: import("@prisma/client-runtime-utils").Decimal;
        knetPercentOfGross: import("@prisma/client-runtime-utils").Decimal;
        knetRule: import("@prisma/client").$Enums.KnetCommissionRule;
        cardPercentOfGross: import("@prisma/client-runtime-utils").Decimal;
    }>;
}
