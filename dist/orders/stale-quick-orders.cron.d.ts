import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';
export declare class StaleQuickOrdersCronService {
    private readonly prisma;
    private readonly orders;
    private readonly logger;
    constructor(prisma: PrismaService, orders: OrdersService);
    handleCron(): Promise<void>;
}
