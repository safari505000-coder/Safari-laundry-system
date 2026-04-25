import { OnModuleInit } from '@nestjs/common';
import { PosPaymentMethod, Prisma } from '@prisma/client';
import { CustomerLedgerService } from '../../customer-ledger/customer-ledger.service';
import { CustomerNotificationsService } from '../../customer-notifications/customer-notifications.service';
import { GeneralLedgerService } from '../../general-ledger/general-ledger.service';
import { InventoryService } from '../../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
export type CreatePaymentLinkParams = {
    orderId: string;
    amount: Prisma.Decimal;
    customerPhone: string;
    customerName?: string;
    customerEmail?: string;
    customerUniqueId?: string;
};
export type CreatePaymentLinkResult = {
    url: string;
    reference?: string;
    trackId?: string;
};
type UPaymentsInquiryData = {
    trackId?: string;
    paymentId?: string;
    result?: string;
    transactionId?: string;
    reference?: string;
    amount?: string | number;
    customerExtraData?: string;
    order?: {
        id?: string;
        reference?: string;
    };
};
export declare class PaymentsService implements OnModuleInit {
    private readonly prisma;
    private readonly customerLedger;
    private readonly generalLedger;
    private readonly inventory;
    private readonly customerNotifications;
    private readonly logger;
    private prodFirstMockLinkLogged;
    private readonly apiBase;
    private readonly apiKey;
    private readonly merchantId;
    private readonly secret;
    private readonly callbackPublicUrl;
    private readonly webAppUrl;
    constructor(prisma: PrismaService, customerLedger: CustomerLedgerService, generalLedger: GeneralLedgerService, inventory: InventoryService, customerNotifications: CustomerNotificationsService);
    onModuleInit(): void;
    paymentsMockExplicit(): boolean;
    usePlaceholderGateway(): boolean;
    isPublicMockCheckoutAvailable(): boolean;
    allowDevMockCallback(body: {
        devMock?: boolean;
    }): boolean;
    createPaymentLink(params: CreatePaymentLinkParams): Promise<CreatePaymentLinkResult>;
    fetchGatewayStatus(trackId: string): Promise<{
        ok: boolean;
        data: UPaymentsInquiryData;
        raw: unknown;
    }>;
    private signPayload;
    verifyIntegratedCallback(dto: {
        orderId: string;
        status: string;
        amount?: string;
        signature?: string;
    }): boolean;
    normalizeCallbackStatus(status: string): 'success' | 'failed';
    ensurePaymentLinkForUnpaidOrder(orderId: string): Promise<CreatePaymentLinkResult>;
    findOrderByTrackId(trackId: string): Promise<string | null>;
    finalizePaidOrderFromGateway(referenceId: string, gatewayMetadata?: Prisma.InputJsonValue): Promise<void>;
    private finalizeSinglePaidOrderFromGateway;
    schedulePaymentConfirmedCustomerNotify(orderId: string): void;
    private emitPaymentConfirmedNotify;
    private resolveFallbackPerformer;
    manuallyMarkOrderPaidByMethod(args: {
        orderId: string;
        method: Exclude<PosPaymentMethod, 'SUBSCRIPTION_WALLET' | 'DEBT_ON_ACCOUNT'>;
        performedByUserId: string;
    }): Promise<{
        orderId: string;
        alreadySettled: boolean;
        amountKd: string;
        posPaymentMethod: PosPaymentMethod;
    }>;
}
export {};
