export declare class SecretsService {
    private readonly logger;
    private readonly cache;
    private awsClient;
    private ttlMs;
    get(key: string): Promise<string | undefined>;
    invalidate(key: string): void;
    private loadAws;
    private loadVault;
}
