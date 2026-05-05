import { type CustomerEvaluationFinancials } from '../../customers/customer-evaluator';
import { PrismaService } from '../../prisma/prisma.service';
export declare class CustomerIntelligenceService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    buildCustomerIntelligence(customerId: string, financials: CustomerEvaluationFinancials): Promise<import("../../customers/customer-evaluator").CustomerIntelligence>;
}
