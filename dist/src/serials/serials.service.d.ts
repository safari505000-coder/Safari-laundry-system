import { PrismaService } from '../prisma/prisma.service';
import { SerialCounterService } from './serial-counter.service';
import type { DriverPrefixRowDto, SerialLogDto } from './dto/serials.dto';
export declare class SerialsService {
    private readonly prisma;
    private readonly counter;
    constructor(prisma: PrismaService, counter: SerialCounterService);
    listDrivers(): Promise<DriverPrefixRowDto[]>;
    setDriverPrefix(userId: string, rawPrefix: string | null | undefined): Promise<DriverPrefixRowDto>;
    getSerialLog(limit?: number): Promise<SerialLogDto>;
}
