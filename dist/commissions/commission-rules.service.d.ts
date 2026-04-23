import { CommissionMode, Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto';
export declare class CommissionRulesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private assertOwnerOrGM;
    list(actorRole: SafariRole, opts?: {
        mode?: CommissionMode;
    }): Promise<{
        role: import("@prisma/client").$Enums.SafariRole | null;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        isActive: boolean;
        mode: import("@prisma/client").$Enums.CommissionMode;
        calculationBase: import("@prisma/client").$Enums.CommissionCalculationBase;
        percentage: Prisma.Decimal;
        minInvoiceAmount: Prisma.Decimal;
        payoutTiming: import("@prisma/client").$Enums.CommissionPayoutTiming;
        linkedToDebt: boolean;
    }[]>;
    findOne(actorRole: SafariRole, id: string): Promise<{
        role: import("@prisma/client").$Enums.SafariRole | null;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        isActive: boolean;
        mode: import("@prisma/client").$Enums.CommissionMode;
        calculationBase: import("@prisma/client").$Enums.CommissionCalculationBase;
        percentage: Prisma.Decimal;
        minInvoiceAmount: Prisma.Decimal;
        payoutTiming: import("@prisma/client").$Enums.CommissionPayoutTiming;
        linkedToDebt: boolean;
    }>;
    create(actorRole: SafariRole, dto: CreateCommissionRuleDto): Promise<{
        role: import("@prisma/client").$Enums.SafariRole | null;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        isActive: boolean;
        mode: import("@prisma/client").$Enums.CommissionMode;
        calculationBase: import("@prisma/client").$Enums.CommissionCalculationBase;
        percentage: Prisma.Decimal;
        minInvoiceAmount: Prisma.Decimal;
        payoutTiming: import("@prisma/client").$Enums.CommissionPayoutTiming;
        linkedToDebt: boolean;
    }>;
    update(actorRole: SafariRole, id: string, dto: UpdateCommissionRuleDto): Promise<{
        role: import("@prisma/client").$Enums.SafariRole | null;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        isActive: boolean;
        mode: import("@prisma/client").$Enums.CommissionMode;
        calculationBase: import("@prisma/client").$Enums.CommissionCalculationBase;
        percentage: Prisma.Decimal;
        minInvoiceAmount: Prisma.Decimal;
        payoutTiming: import("@prisma/client").$Enums.CommissionPayoutTiming;
        linkedToDebt: boolean;
    }>;
    remove(actorRole: SafariRole, id: string): Promise<{
        role: import("@prisma/client").$Enums.SafariRole | null;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        isActive: boolean;
        mode: import("@prisma/client").$Enums.CommissionMode;
        calculationBase: import("@prisma/client").$Enums.CommissionCalculationBase;
        percentage: Prisma.Decimal;
        minInvoiceAmount: Prisma.Decimal;
        payoutTiming: import("@prisma/client").$Enums.CommissionPayoutTiming;
        linkedToDebt: boolean;
    }>;
    getDefaultRule(actorRole: SafariRole): Promise<{
        role: import("@prisma/client").$Enums.SafariRole | null;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        isActive: boolean;
        mode: import("@prisma/client").$Enums.CommissionMode;
        calculationBase: import("@prisma/client").$Enums.CommissionCalculationBase;
        percentage: Prisma.Decimal;
        minInvoiceAmount: Prisma.Decimal;
        payoutTiming: import("@prisma/client").$Enums.CommissionPayoutTiming;
        linkedToDebt: boolean;
    } | null>;
    upsertDefaultRule(actorRole: SafariRole, dto: CreateCommissionRuleDto): Promise<{
        role: import("@prisma/client").$Enums.SafariRole | null;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        isActive: boolean;
        mode: import("@prisma/client").$Enums.CommissionMode;
        calculationBase: import("@prisma/client").$Enums.CommissionCalculationBase;
        percentage: Prisma.Decimal;
        minInvoiceAmount: Prisma.Decimal;
        payoutTiming: import("@prisma/client").$Enums.CommissionPayoutTiming;
        linkedToDebt: boolean;
    }>;
}
