import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare class SerialCounterService {
    private readonly prisma;
    private static readonly ORDER_SERIAL_KEY;
    constructor(prisma: PrismaService);
    stampOrderSerial(tx: Prisma.TransactionClient, driverId: string | null | undefined): Promise<string | null>;
    incrementCounter(tx: Prisma.TransactionClient, key: string): Promise<number>;
    peek(key?: string): Promise<number>;
}
