import type { Prisma, SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
export declare class SubscriptionPlansService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<SubscriptionPlan[]>;
    findOne(id: string): Promise<SubscriptionPlan>;
    create(dto: CreateSubscriptionPlanDto): Prisma.Prisma__SubscriptionPlanClient<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        salePrice: Prisma.Decimal;
        actualBalance: Prisma.Decimal;
        validityDays: number;
    }, never, import("@prisma/client/runtime/client").DefaultArgs, Prisma.PrismaClientOptions>;
    update(id: string, dto: UpdateSubscriptionPlanDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        salePrice: Prisma.Decimal;
        actualBalance: Prisma.Decimal;
        validityDays: number;
    }>;
    remove(id: string): Promise<{
        deleted: true;
    }>;
}
