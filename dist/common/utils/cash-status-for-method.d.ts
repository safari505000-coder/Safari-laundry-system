import { CashStatus, PosPaymentMethod } from "@prisma/client";
export declare function cashStatusForPaymentMethod(method: PosPaymentMethod | null | undefined): CashStatus;
export declare function isElectronicMethod(method: PosPaymentMethod | null | undefined): boolean;
