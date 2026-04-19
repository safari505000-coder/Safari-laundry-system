import { ShiftCycleService } from './shift-cycle.service';
export declare class ShiftsController {
    private readonly shiftCycle;
    constructor(shiftCycle: ShiftCycleService);
    getCurrentCycle(): Promise<{
        timezone: string;
        cycleStartAt: string;
        cycleEndAt: string;
        nextCycleAt: string;
        driversOnShift: number;
        activeDriversTotal: number;
        staleOpenShifts: number;
    }>;
    getRecentCycles(days?: string): Promise<{
        cycleStartAt: string;
        cycleEndAt: string;
        shiftsOpened: number;
        shiftsClosed: number;
    }[]>;
    runNow(): Promise<{
        closed: number;
        opened: number;
        cycleStartAt: string;
    }>;
}
