import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { FeedbackService } from './feedback.service';
export declare class FeedbackController {
    private readonly svc;
    constructor(svc: FeedbackService);
    list(onlyUnreadRaw?: string, minRatingRaw?: string, maxRatingRaw?: string, takeRaw?: string, skipRaw?: string): Promise<{
        total: number;
        unread: number;
        avgRating: number;
        ratedCount: number;
        rows: {
            id: string;
            rating: number;
            note: string | null;
            submittedAt: string;
            ipMasked: string | null;
            acknowledgedAt: string | null;
            order: {
                id: string;
                serialNumber: string | null;
                invoiceNumber: string | null;
                totalKd: string;
                createdAt: string;
                status: import(".prisma/client").$Enums.OrderStatus;
                driver: {
                    id: string;
                    fullName: string;
                    username: string;
                } | null;
                customer: {
                    id: string;
                    displayName: string | null;
                    phone: string;
                };
            };
        }[];
    }>;
    acknowledge(id: string, user: JwtUser): Promise<{
        ok: boolean;
        alreadyAcknowledged: boolean;
    }>;
}
