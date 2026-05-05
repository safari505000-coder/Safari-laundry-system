import { DiscordAlertService } from '../common/services/discord-alert.service';
import { AuditLogsService } from './audit-logs.service';
export declare class AuditIntegrityCron {
    private readonly audit;
    private readonly discord;
    private readonly logger;
    constructor(audit: AuditLogsService, discord: DiscordAlertService);
    verify(): Promise<void>;
}
