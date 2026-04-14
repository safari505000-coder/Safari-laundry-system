import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { SubscriptionPlansService } from './subscription-plans.service';
export declare class SubscriptionPlansController {
    private readonly subscriptionPlansService;
    constructor(subscriptionPlansService: SubscriptionPlansService);
    create(dto: CreateSubscriptionPlanDto): import("@prisma/client").Prisma.Prisma__SubscriptionPlanClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        price: import("@prisma/client-runtime-utils").Decimal;
        creditAmount: import("@prisma/client-runtime-utils").Decimal;
        validityDays: number;
        isActive: boolean;
    }, never, import("@prisma/client/runtime/client").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    findAll(): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        price: import("@prisma/client-runtime-utils").Decimal;
        creditAmount: import("@prisma/client-runtime-utils").Decimal;
        validityDays: number;
        isActive: boolean;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        price: import("@prisma/client-runtime-utils").Decimal;
        creditAmount: import("@prisma/client-runtime-utils").Decimal;
        validityDays: number;
        isActive: boolean;
    }>;
    update(id: string, dto: UpdateSubscriptionPlanDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        price: import("@prisma/client-runtime-utils").Decimal;
        creditAmount: import("@prisma/client-runtime-utils").Decimal;
        validityDays: number;
        isActive: boolean;
    }>;
    remove(id: string): Promise<{
        deleted: true;
    }>;
}
