import { type MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
export declare class ControlTowerStreamService {
    private readonly pushes;
    private emit;
    handleOrderCreated(payload: {
        orderId?: string;
    }): void;
    handleDispatchCreated(payload: {
        id?: string;
    }): void;
    handleDispatchAcknowledged(payload: {
        dispatchId?: string;
    }): void;
    handleDispatchCompleted(payload: {
        dispatchId?: string;
    }): void;
    subscribeFeed(): Observable<MessageEvent>;
}
