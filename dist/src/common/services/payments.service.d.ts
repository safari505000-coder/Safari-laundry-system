import { PosPaymentMethod, Prisma } from '@prisma/client';
import { CustomerLedgerService } from '../../customer-ledger/customer-ledger.service';
import { PrismaService } from '../../prisma/prisma.service';
export type CreatePaymentLinkParams = {
    orderId: string;
    amount: Prisma.Decimal;
    customerPhone: string;
};
export type CreatePaymentLinkResult = {
    url: string;
    reference?: string;
};
export declare class PaymentsService {
    private readonly prisma;
    private readonly customerLedger;
    private readonly logger;
    private readonly apiBase;
    private readonly apiKey;
    private readonly merchantId;
    private readonly secret;
    private readonly callbackPublicUrl;
    constructor(prisma: PrismaService, customerLedger: CustomerLedgerService);
    paymentsMockExplicit(): boolean;
    usePlaceholderGateway(): boolean;
    isPublicMockCheckoutAvailable(): boolean;
    allowDevMockCallback(body: {
        devMock?: boolean;
    }): boolean;
    createPaymentLink(params: CreatePaymentLinkParams): Promise<CreatePaymentLinkResult>;
    private signPayload;
    verifyIntegratedCallback(dto: {
        orderId: string;
        status: string;
        amount?: string;
        signature?: string;
    }): boolean;
    normalizeCallbackStatus(status: string): 'success' | 'failed';
    ensurePaymentLinkForUnpaidOrder(orderId: string): Promise<CreatePaymentLinkResult>;
    finalizePaidOrderFromGateway(referenceId: string): Promise<void>;
    private finalizeSinglePaidOrderFromGateway;
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
