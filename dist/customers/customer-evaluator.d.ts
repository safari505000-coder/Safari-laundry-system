export type CustomerRating = 'GOOD' | 'WATCH' | 'BLOCKED';
export type CustomerHealth = 'GOOD' | 'WATCH' | 'RISK' | 'BLOCKED';
export type CustomerEvaluationFinancials = {
    consumedKd: string | number;
    subscriptionValueKd: string | number;
    subscriptionConsumedKd?: string | number;
    totalDueKd: string | number;
    isBlocked?: boolean;
};
export declare function evaluateCustomer(fin: CustomerEvaluationFinancials): CustomerRating;
export declare function buildInsight(fin: CustomerEvaluationFinancials, rating: CustomerRating): string;
export type CustomerIntelligenceInput = CustomerEvaluationFinancials & {
    paymentConsistency?: number;
    avgPaymentDelayHours?: number;
    lifetimeValueKd?: string | number;
};
export type CustomerIntelligence = {
    customerHealth: CustomerHealth;
    paymentConsistency: number;
    avgPaymentDelayHours: number;
    lifetimeValueKd: string;
};
export declare function evaluateCustomerIntelligence(input: CustomerIntelligenceInput): CustomerIntelligence;
