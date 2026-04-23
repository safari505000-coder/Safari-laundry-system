import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { SafariStreamService, type SafariStreamSnapshotDto } from './safari-stream.service';
export declare class SafariStreamController {
    private readonly safariStream;
    constructor(safariStream: SafariStreamService);
    snapshot(user: JwtUser): Promise<SafariStreamSnapshotDto>;
}
