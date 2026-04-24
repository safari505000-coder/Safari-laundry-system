import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { FeedbackService } from './feedback.service';
export declare class PublicFeedbackController {
    private readonly svc;
    constructor(svc: FeedbackService);
    get(orderId: string): Promise<{
        orderId: string;
        serialNumber: string | null;
        invoiceNumber: string | null;
        totalKd: string;
        createdAt: string;
        driverFirstName: string | null;
        customerFirstName: string | null;
        alreadyRated: {
            rating: number;
            note: string | null;
            submittedAt: string;
        } | null;
    }>;
    submit(orderId: string, dto: SubmitFeedbackDto, ip: string): Promise<{
        ok: boolean;
        rating: number;
        note: string | null;
        at: string;
    }>;
}
