import { Prisma } from "@prisma/client";
export declare function fixed4ToMinor(value: Prisma.Decimal | string | number | null | undefined): bigint;
export declare function minorToFixed4(value: bigint): string;
export declare function absMinor(value: bigint): bigint;
