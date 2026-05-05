import { BeforeApplicationShutdown } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
export declare class HttpDrainService implements BeforeApplicationShutdown {
    private readonly httpAdapterHost;
    private readonly logger;
    constructor(httpAdapterHost: HttpAdapterHost);
    beforeApplicationShutdown(signal?: string): Promise<void>;
}
