import { PrismaService } from '../prisma/prisma.service';
export declare class DispatchMetricsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    kuwaitCalendarDateUtc(d: Date): Date;
    incrementAssigned(driverId: string, at: Date): Promise<void>;
    recordAcknowledged(driverId: string, at: Date, ackMinutes: number): Promise<void>;
    recordCompletion(input: {
        driverId: string;
        at: Date;
        totalMinutes: number;
    }): Promise<void>;
}
