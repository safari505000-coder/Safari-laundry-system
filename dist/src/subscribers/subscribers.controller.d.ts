import type { SubscriberListRow } from './subscribers.service';
import { SubscribersService } from './subscribers.service';
export declare class SubscribersController {
    private readonly subscribersService;
    constructor(subscribersService: SubscribersService);
    list(): Promise<SubscriberListRow[]>;
}
