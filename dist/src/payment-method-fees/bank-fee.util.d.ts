import { KnetCommissionRule, PosPaymentMethod, Prisma } from '@prisma/client';
export type PaymentFeeConfigShape = {
    knetFlatKd: Prisma.Decimal | string;
    knetPercentOfGross: Prisma.Decimal | string;
    knetRule: KnetCommissionRule;
    cardPercentOfGross: Prisma.Decimal | string;
};
export declare function computeOrderBankFeeKd(grossKd: Prisma.Decimal | string | number, method: PosPaymentMethod | null | undefined, config: PaymentFeeConfigShape): Prisma.Decimal;
