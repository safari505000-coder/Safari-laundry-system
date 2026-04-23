import { DriverPrefixRowDto, SerialLogDto, SetDriverPrefixDto } from './dto/serials.dto';
import { SerialGapService, type GapReport } from './serial-gap.service';
import { SerialsService } from './serials.service';
export declare class SerialsController {
    private readonly serials;
    private readonly gaps;
    constructor(serials: SerialsService, gaps: SerialGapService);
    listDrivers(): Promise<DriverPrefixRowDto[]>;
    setDriverPrefix(userId: string, dto: SetDriverPrefixDto): Promise<DriverPrefixRowDto>;
    getSerialLog(limit?: string): Promise<SerialLogDto>;
    getLatestGapReport(): Promise<{
        latest: Awaited<ReturnType<SerialGapService['latestReport']>>;
    }>;
    scanGapsNow(): Promise<GapReport>;
}
