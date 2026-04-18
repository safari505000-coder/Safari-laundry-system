import { DriverPrefixRowDto, SerialLogDto, SetDriverPrefixDto } from './dto/serials.dto';
import { SerialsService } from './serials.service';
export declare class SerialsController {
    private readonly serials;
    constructor(serials: SerialsService);
    listDrivers(): Promise<DriverPrefixRowDto[]>;
    setDriverPrefix(userId: string, dto: SetDriverPrefixDto): Promise<DriverPrefixRowDto>;
    getSerialLog(limit?: string): Promise<SerialLogDto>;
}
