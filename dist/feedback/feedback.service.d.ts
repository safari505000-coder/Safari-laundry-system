import { PrismaService } from '../prisma/prisma.service';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
export declare class FeedbackService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    publicGetOrder(orderId: string): Promise<{
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
    submitFeedback(orderId: string, dto: SubmitFeedbackDto, clientIp: string | null): Promise<{
        ok: boolean;
        rating: number;
        note: string | null;
        at: string;
    }>;
    listFeedback(opts: {
        onlyUnread?: boolean;
        minRating?: number;
        maxRating?: number;
        take?: number;
        skip?: number;
    }): Promise<{
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
                status: import("@prisma/client").$Enums.OrderStatus;
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
    acknowledge(id: string, userId: string): Promise<{
        ok: boolean;
        alreadyAcknowledged: boolean;
    }>;
}
