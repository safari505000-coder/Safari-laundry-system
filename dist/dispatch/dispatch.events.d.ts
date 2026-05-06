import type { DispatchRowDto } from './dto/dispatch-row.dto';
export declare const ORDER_CREATED_EVENT: "order.created";
export type OrderCreatedEventPayload = {
    orderId: string;
    dispatchId: string | null;
    actorUserId: string | null;
    occurredAtIso: string;
};
export declare const DISPATCH_CREATED_EVENT: "dispatch.created";
export declare const DISPATCH_COMPLETED_EVENT: "dispatch.completed";
export declare const DISPATCH_ACKNOWLEDGED_EVENT: "dispatch.acknowledged";
export type DispatchStreamEventPayload = {
    dispatchId: string;
    driverId: string;
    customerId: string;
    status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    createdAtIso: string;
    acknowledgedAtIso?: string | null;
    completedAtIso: string | null;
};
export type DriverDispatchSseEvent = 'dispatch:new' | 'dispatch:update' | 'dispatch:alert' | 'heartbeat';
export type DriverDispatchSseEnvelope = {
    event: DriverDispatchSseEvent;
    row?: DispatchRowDto;
};
