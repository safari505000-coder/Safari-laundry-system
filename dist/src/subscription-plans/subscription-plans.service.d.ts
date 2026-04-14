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
        createdAt: Date;
        updatedAt: Date;
        name: string;
        price: Prisma.Decimal;
        creditAmount: Prisma.Decimal;
        validityDays: number;
        isActive: boolean;
    }, never, import("@prisma/client/runtime/client").DefaultArgs, Prisma.PrismaClientOptions>;
    update(id: string, dto: UpdateSubscriptionPlanDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        price: Prisma.Decimal;
        creditAmount: Prisma.Decimal;
        validityDays: number;
        isActive: boolean;
    }>;
    remove(id: string): Promise<{
        deleted: true;
    }>;
}
