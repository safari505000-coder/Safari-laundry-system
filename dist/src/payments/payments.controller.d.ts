import { PaymentsService } from '../common/services/payments.service';
import { PaymentCallbackDto } from './dto/payment-callback.dto';
export declare class PaymentsController {
    private readonly paymentsService;
    constructor(paymentsService: PaymentsService);
    callback(body: PaymentCallbackDto): Promise<{
        ok: true;
        orderId: string;
        outcome: "success" | "failed";
    }>;
}
