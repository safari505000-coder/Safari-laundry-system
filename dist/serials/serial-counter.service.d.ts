import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare class SerialCounterService {
    private readonly prisma;
    private static readonly ORDER_SERIAL_KEY;
    static readonly USER_ORDER_KEY_PREFIX = "OU_";
    constructor(prisma: PrismaService);
    static orderSerialKeyForUser(userId: string): string;
    private escapeRegex;
    private maxSerialSuffixForOperator;
    stampOrderSerial(tx: Prisma.TransactionClient, driverId: string | null | undefined): Promise<string | null>;
    incrementCounter(tx: Prisma.TransactionClient, key: string): Promise<number>;
    peek(key?: string): Promise<number>;
    countOrdersWithSerialNumber(): Promise<number>;
}
