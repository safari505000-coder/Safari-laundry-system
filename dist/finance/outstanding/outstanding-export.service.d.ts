import { Readable } from 'node:stream';
import type { JwtUser } from '../../auth/decorators/current-user.decorator';
import { OutstandingQueryDto } from './dto/outstanding-query.dto';
import { OutstandingService } from './outstanding.service';
export declare class OutstandingExportService {
    private readonly outstanding;
    constructor(outstanding: OutstandingService);
    toXlsx(query: OutstandingQueryDto, actor?: JwtUser | null): Promise<{
        stream: Readable;
        filename: string;
    }>;
    private styleHeader;
}
