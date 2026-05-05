import { DiscordAlertService } from '../common/services/discord-alert.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class SystemInvariantsService {
    private readonly prisma;
    private readonly discord;
    private readonly logger;
    constructor(prisma: PrismaService, discord: DiscordAlertService);
    check(): Promise<void>;
    private negativeWallets;
    private duplicateTransactionHints;
}
