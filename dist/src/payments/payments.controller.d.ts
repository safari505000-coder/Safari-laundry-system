import type { Response } from 'express';
import { PaymentsService } from '../common/services/payments.service';
import { PaymentCallbackDto } from './dto/payment-callback.dto';
export declare class PaymentsController {
    private readonly paymentsService;
    constructor(paymentsService: PaymentsService);
    mockCheckoutPage(orderId: string | undefined, res: Response): void;
    mockCheckoutPageAlias(orderId: string | undefined, res: Response): void;
    callback(body: PaymentCallbackDto): Promise<{
        ok: true;
        orderId: string;
        outcome: "success" | "failed";
    }>;
}
