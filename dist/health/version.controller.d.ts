export declare class VersionController {
    private readonly startedAtMs;
    get(): {
        name: string;
        version: string;
        timestamp: string;
        gitCommit: string;
        buildTime: string;
        node: string;
        env: string;
        uptime: number;
        startedAt: string;
        region: string;
        deploymentColor: string;
    };
}
