import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
declare function guardAppendOnlyDelegate<T extends object>(delegate: T, label: string): T;
export declare class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly pool;
    private static readonly logger;
    constructor();
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
export { guardAppendOnlyDelegate };
