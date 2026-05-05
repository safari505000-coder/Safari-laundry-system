import type { CustomerSubscriptionStatus } from "@prisma/client";
export type Customer360FinancialsDto = {
    consumedKd: string;
    totalInvoicesKd: string;
    subscriptionValueKd: string;
    subscriptionConsumedKd: string;
    subscriptionRemainingKd: string;
    totalPaymentsKd: string;
    totalDueKd: string;
    overpaymentBalanceKd: string;
    isBlocked: boolean;
    blockReason: string | null;
    blockedAtIso: string | null;
};
export type Customer360StatementDto = {
    financials: Customer360FinancialsDto;
    narrativeLines?: string[];
};
export type Customer360SubscriptionFinancialsDto = {
    subscriptionValueKd: string;
    subscriptionConsumedKd: string;
    subscriptionRemainingKd: string;
};
export type Customer360SubscriptionDto = {
    id: string;
    status: CustomerSubscriptionStatus;
    planNameSnapshot: string;
    planSalePriceKd: string;
    planActualBalanceKd: string;
    planValidityDays: number;
    carriedBalanceKd: string;
    activatedAtIso: string;
    expiresAtIso: string;
    closedAtIso: string | null;
    closedReason: string | null;
};
export type Customer360ScoreDto = {
    value: number;
    feedbackAverage: number | null;
    factors: string[];
};
export type Customer360InsightsDto = {
    summary: string;
    detail: string;
};
export type Customer360AlertDto = {
    code: string;
    message: string;
};
export type Customer360CustomerDto = {
    id: string;
    displayName: string | null;
    phone: string;
    phone2: string | null;
};
export type Customer360InternalDto = {
    customer: Customer360CustomerDto;
    subscriptions: Customer360SubscriptionDto[];
    subscription: Customer360SubscriptionFinancialsDto;
    statement: Customer360StatementDto;
    rating: 'GOOD' | 'WATCH' | 'BLOCKED';
    insight: string;
    score: Customer360ScoreDto;
    insights: Customer360InsightsDto;
    alerts: Customer360AlertDto[];
    internalNotes: string | null;
};
export type Customer360SanitizedDto = {
    customer: Customer360CustomerDto;
    subscriptions: Customer360SubscriptionDto[];
    subscription: Customer360SubscriptionFinancialsDto;
    statement: Customer360StatementDto;
    rating: 'GOOD' | 'WATCH' | 'BLOCKED';
    insight: string;
    score: null;
    insights: null;
    friendlySummary: string;
};
