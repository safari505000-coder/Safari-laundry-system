import { PrismaService } from '../prisma/prisma.service';
export declare class ShiftCycleService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    handleCron(): Promise<void>;
    runDailyCycle(): Promise<{
        closed: number;
        opened: number;
        cycleStartAt: string;
    }>;
    getCurrentCycle(): Promise<{
        timezone: string;
        cycleStartAt: string;
        cycleEndAt: string;
        nextCycleAt: string;
        driversOnShift: number;
        activeDriversTotal: number;
        staleOpenShifts: number;
    }>;
    getRecentCycles(days?: number): Promise<Array<{
        cycleStartAt: string;
        cycleEndAt: string;
        shiftsOpened: number;
        shiftsClosed: number;
    }>>;
}
