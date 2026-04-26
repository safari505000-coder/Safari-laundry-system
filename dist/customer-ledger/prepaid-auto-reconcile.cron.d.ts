import { PrismaService } from '../prisma/prisma.service';
import { CustomerLedgerService } from './customer-ledger.service';
export declare class PrepaidAutoReconcileCronService {
    private readonly prisma;
    private readonly ledger;
    private readonly logger;
    constructor(prisma: PrismaService, ledger: CustomerLedgerService);
    handleCron(): Promise<void>;
}
