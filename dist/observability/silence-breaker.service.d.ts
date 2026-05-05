import { IntegrationCircuitBreakerService } from '../common/services/integration-circuit-breaker.service';
import { DiscordAlertService } from '../common/services/discord-alert.service';
export declare class SilenceBreakerService {
    private readonly circuit;
    private readonly discord;
    private readonly logger;
    private lastDlqAlert;
    private lastCircuitAlert;
    constructor(circuit: IntegrationCircuitBreakerService, discord: DiscordAlertService);
    tick(): Promise<void>;
    private checkDlqDepth;
    private checkCircuitDuration;
}
