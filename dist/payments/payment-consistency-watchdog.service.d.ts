import { DiscordAlertService } from '../common/services/discord-alert.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class PaymentConsistencyWatchdogService {
    private readonly prisma;
    private readonly discordAlerts;
    private readonly logger;
    constructor(prisma: PrismaService, discordAlerts: DiscordAlertService);
    check(): Promise<void>;
}
