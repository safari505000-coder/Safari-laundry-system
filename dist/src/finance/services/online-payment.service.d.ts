import { PaymentsService } from '../../common/services/payments.service';
import { PrismaService } from '../../prisma/prisma.service';
export declare class OnlinePaymentService {
    private readonly prisma;
    private readonly payments;
    constructor(prisma: PrismaService, payments: PaymentsService);
    isPublicMockCheckoutAvailable(): boolean;
    allowDevMockCallback(body: {
        devMock?: boolean;
    }): boolean;
    verifyIntegratedCallback(dto: {
        orderId: string;
        status: string;
        amount?: string;
        signature?: string;
    }): boolean;
    normalizeCallbackStatus(status: string): 'success' | 'failed';
    finalizePaidOrderFromGateway(referenceId: string): Promise<void>;
    getTotalOnlineRevenue(): Promise<string>;
}
