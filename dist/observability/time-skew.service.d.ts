import { DiscordAlertService } from '../common/services/discord-alert.service';
export declare class TimeSkewService {
    private readonly discord;
    private readonly logger;
    constructor(discord: DiscordAlertService);
    check(): Promise<void>;
}
