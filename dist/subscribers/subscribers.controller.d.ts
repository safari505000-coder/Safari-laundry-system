import { ListSubscribersQueryDto } from './dto/list-subscribers-query.dto';
import type { SubscriberListRow } from './subscribers.service';
import { SubscribersService } from './subscribers.service';
export declare class SubscribersController {
    private readonly subscribersService;
    constructor(subscribersService: SubscribersService);
    list(query: ListSubscribersQueryDto): Promise<SubscriberListRow[]>;
}
