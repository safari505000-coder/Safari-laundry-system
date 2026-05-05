import { SystemConfigService } from '../system-config/system-config.service';
export type OwnerAlertVia = 'moatmt' | 'webhook' | 'log' | 'skipped';
export type OwnerAlertResult = {
    delivered: boolean;
    via: OwnerAlertVia;
    error: string | null;
    to: string;
    source: 'database' | 'env' | 'none';
};
export declare class OwnerAlertNotifierService {
    private readonly config;
    private readonly logger;
    constructor(config: SystemConfigService);
    send(message: string): Promise<OwnerAlertResult>;
    isProviderConfigured(): boolean;
    ownerPhoneMasked(): Promise<{
        masked: string | null;
        source: 'database' | 'env' | 'none';
    }>;
    private tryMoatmt;
    private tryWebhook;
    private postJson;
}
