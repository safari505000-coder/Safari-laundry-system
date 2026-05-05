import { KnetCommissionRule } from "@prisma/client";
export declare class UpdatePaymentMethodFeesDto {
    knetFlatKd?: number;
    knetPercentOfGross?: number;
    knetRule?: KnetCommissionRule;
    cardPercentOfGross?: number;
}
