import type { Response } from 'express';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../common/services/payments.service';
import { PaymentCallbackDto } from './dto/payment-callback.dto';
declare class PublicOrderStatusDto {
    orderId: string;
    status: OrderStatus;
    isPaid: boolean;
    amountKd: string;
}
export declare class PaymentsController {
    private readonly paymentsService;
    private readonly prisma;
    private readonly logger;
    constructor(paymentsService: PaymentsService, prisma: PrismaService);
    mockCheckoutPage(orderId: string | undefined, res: Response): void;
    mockCheckoutPageAlias(orderId: string | undefined, res: Response): void;
    callback(body: PaymentCallbackDto): Promise<{
        ok: true;
        orderId: string;
        outcome: "success" | "failed";
        reason?: undefined;
        trackId?: undefined;
    } | {
        ok: false;
        outcome: "failed";
        reason: string;
        orderId?: undefined;
        trackId?: undefined;
    } | {
        ok: true;
        orderId: string;
        trackId: string;
        outcome: "success" | "failed";
        reason?: undefined;
    }>;
    publicOrderStatus(orderId: string, track_id?: string, trackID?: string, trackIdQuery?: string): Promise<PublicOrderStatusDto>;
    recheckPayment(orderId: string, track_id?: string, trackID?: string, trackIdQuery?: string): Promise<{
        orderId: string;
        status: OrderStatus;
        isPaid: boolean;
        amountKd: string;
        trackIdPresent: boolean;
        gatewayResult: string | null;
        settledNow: boolean;
        messageAr: string;
    }>;
}
export {};
