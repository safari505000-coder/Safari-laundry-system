export declare class VersionController {
    private readonly version;
    private readonly startedAtMs;
    constructor();
    get(): {
        name: string;
        version: string;
        gitCommit: string;
        buildTime: string;
        node: string;
        env: string;
        uptime: number;
        startedAt: string;
    };
}
