export declare const ORDER_CREATED_EVENT: "order.created";
export type OrderCreatedEventPayload = {
    orderId: string;
    dispatchId: string | null;
    actorUserId: string | null;
    occurredAtIso: string;
};
export declare const DISPATCH_CREATED_EVENT: "dispatch.created";
export declare const DISPATCH_COMPLETED_EVENT: "dispatch.completed";
export type DispatchStreamEventPayload = {
    dispatchId: string;
    driverId: string;
    customerId: string;
    status: 'ASSIGNED' | 'COMPLETED';
    createdAtIso: string;
    completedAtIso: string | null;
};
