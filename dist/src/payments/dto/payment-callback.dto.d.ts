export declare class PaymentCallbackDto {
    orderId: string;
    status: string;
    amount?: string;
    signature?: string;
    gatewayReference?: string;
    devMock?: boolean;
}
