import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { SubscriptionPlansService } from './subscription-plans.service';
export declare class SubscriptionPlansController {
    private readonly subscriptionPlansService;
    constructor(subscriptionPlansService: SubscriptionPlansService);
    create(dto: CreateSubscriptionPlanDto): import(".prisma/client").Prisma.Prisma__SubscriptionPlanClient<{
        name: string;
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        salePrice: import("@prisma/client-runtime-utils/dist").Decimal;
        actualBalance: import("@prisma/client-runtime-utils/dist").Decimal;
        validityDays: number;
    }, never, import("@prisma/client/runtime/client").DefaultArgs, import(".prisma/client").Prisma.PrismaClientOptions>;
    findAll(): Promise<{
        name: string;
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        salePrice: import("@prisma/client-runtime-utils/dist").Decimal;
        actualBalance: import("@prisma/client-runtime-utils/dist").Decimal;
        validityDays: number;
    }[]>;
    findOne(id: string): Promise<{
        name: string;
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        salePrice: import("@prisma/client-runtime-utils/dist").Decimal;
        actualBalance: import("@prisma/client-runtime-utils/dist").Decimal;
        validityDays: number;
    }>;
    update(id: string, dto: UpdateSubscriptionPlanDto): Promise<{
        name: string;
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        salePrice: import("@prisma/client-runtime-utils/dist").Decimal;
        actualBalance: import("@prisma/client-runtime-utils/dist").Decimal;
        validityDays: number;
    }>;
    remove(id: string): Promise<{
        deleted: true;
    }>;
}
