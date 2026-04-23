import { Prisma } from '@prisma/client';
export declare const CANONICAL_PAYMENT_METHOD_FEE_CONFIG: {
    readonly knetFlatKd: Prisma.Decimal;
    readonly knetPercentOfGross: Prisma.Decimal;
    readonly knetRule: "HIGHER_OF_FLAT_AND_PERCENT";
    readonly cardPercentOfGross: Prisma.Decimal;
};
