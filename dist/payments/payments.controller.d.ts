import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../common/services/payments.service';
import { GatewayTrackHintDto } from './dto/gateway-track-hint.dto';
import { PaymentCallbackDto } from './dto/payment-callback.dto';
declare class PublicOrderStatusDto {
    orderId: string;
    status: OrderStatus;
    isPaid: boolean;
    paid: boolean;
    amountKd: string;
    serialNumber: string | null;
    invoiceNumber: string | null;
    pdfUrl: string | null;
    shareUrl: string | null;
}
export declare class PaymentsController {
    private readonly paymentsService;
    private readonly prisma;
    private readonly jwt;
    private readonly logger;
    constructor(paymentsService: PaymentsService, prisma: PrismaService, jwt: JwtService);
    private attachGatewayTrackIdToOrder;
    private mintInvoiceShareUrlsForOrder;
    mockCheckoutPage(orderId: string | undefined, res: Response): void;
    mockCheckoutPageAlias(orderId: string | undefined, res: Response): void;
    callback(body: PaymentCallbackDto): Promise<{
        ok: true;
        orderId: string;
        outcome: "success" | "failed";
        reason?: undefined;
    } | {
        ok: true;
        outcome: "failed";
        reason: string;
        orderId?: undefined;
    } | {
        reason?: string | undefined;
        ok: true;
        orderId: string;
        trackId: string;
        outcome: "success" | "failed";
    }>;
    publicOrderStatusGet(req: Request, orderId: string, track_id?: string, trackID?: string, trackIdQuery?: string, gatewayResultQuery?: string): Promise<PublicOrderStatusDto>;
    publicOrderStatusPost(req: Request, orderId: string, body: GatewayTrackHintDto, track_id?: string, trackID?: string, trackIdQuery?: string, gatewayResultQuery?: string): Promise<PublicOrderStatusDto>;
    private runPublicOrderStatusPoll;
    recheckPaymentPost(req: Request, orderId: string, body: GatewayTrackHintDto, track_id?: string, trackID?: string, trackIdQuery?: string, gatewayResultQuery?: string): Promise<{
        orderId: string;
        status: OrderStatus;
        isPaid: boolean;
        paid: boolean;
        amountKd: string;
        trackIdPresent: boolean;
        gatewayResult: string | null;
        settledNow: boolean;
        messageAr: string;
        serialNumber: string | null;
        invoiceNumber: string | null;
        pdfUrl: string | null;
        shareUrl: string | null;
    }>;
    recheckPaymentGet(req: Request, orderId: string, track_id?: string, trackID?: string, trackIdQuery?: string, gatewayResultQuery?: string): Promise<{
        orderId: string;
        status: OrderStatus;
        isPaid: boolean;
        paid: boolean;
        amountKd: string;
        trackIdPresent: boolean;
        gatewayResult: string | null;
        settledNow: boolean;
        messageAr: string;
        serialNumber: string | null;
        invoiceNumber: string | null;
        pdfUrl: string | null;
        shareUrl: string | null;
    }>;
    private runRecheckPayment;
}
export {};
