import { OnModuleInit } from "@nestjs/common";
export declare class QueueIntegrityService implements OnModuleInit {
    private readonly logger;
    onModuleInit(): void;
    periodic(): Promise<void>;
    private scanOnce;
}
